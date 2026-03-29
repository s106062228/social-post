import { type NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { PublishStatus } from "@prisma/client";
import { handleRouteError } from "@/lib/errors";

// ── Signature verification ────────────────────────────────────────────────────

/**
 * Verify the X-Hub-Signature-256 header from Meta.
 * Meta signs the raw body with HMAC-SHA256 using the app secret.
 */
function verifySignature(rawBody: string, signatureHeader: string): boolean {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) return false;

  const expectedPrefix = "sha256=";
  if (!signatureHeader.startsWith(expectedPrefix)) return false;

  const receivedHex = signatureHeader.slice(expectedPrefix.length);
  const computed = createHmac("sha256", appSecret).update(rawBody).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(receivedHex, "hex"));
  } catch {
    return false;
  }
}

// ── Webhook payload schemas ───────────────────────────────────────────────────

const webhookEntrySchema = z.object({
  id: z.string(),
  time: z.number().optional(),
  changes: z
    .array(
      z.object({
        field: z.string(),
        value: z.unknown(),
      })
    )
    .optional(),
  messaging: z.array(z.unknown()).optional(),
});

const webhookPayloadSchema = z.object({
  object: z.string(),
  entry: z.array(webhookEntrySchema),
});

// ── Value schemas for known fields ───────────────────────────────────────────

const mediaStatusChangeSchema = z.object({
  media_id: z.string().optional(),
  post_id: z.string().optional(),
  published: z.boolean().optional(),
  status: z
    .enum(["PUBLISHED", "ERROR", "EXPIRED", "IN_PROGRESS", "FINISHED"])
    .optional(),
  error: z
    .object({
      code: z.number().optional(),
      message: z.string().optional(),
      subcode: z.number().optional(),
    })
    .optional(),
});

// ── GET /api/webhooks/meta — Hub challenge verification ───────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (!verifyToken) {
    console.error("[Webhook] META_WEBHOOK_VERIFY_TOKEN is not configured");
    return NextResponse.json(
      { error: "Webhook verification token not configured" },
      { status: 500 }
    );
  }

  if (mode === "subscribe" && token === verifyToken) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

// ── POST /api/webhooks/meta — Receive webhook events ─────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const rawBody = await request.text();

    // Verify HMAC signature
    const signature = request.headers.get("x-hub-signature-256") ?? "";
    if (!verifySignature(rawBody, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody) as unknown;
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const parsed = webhookPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: "Unrecognised payload shape" }, { status: 400 });
    }

    const { object, entry } = parsed.data;

    // Process relevant webhook events
    for (const evt of entry) {
      if (!evt.changes) continue;

      for (const change of evt.changes) {
        // Instagram / Threads media status updates
        if (
          (object === "instagram" || object === "threads") &&
          change.field === "media_publish_status"
        ) {
          await handleMediaStatusChange(change.value);
        }

        // Facebook page post status updates
        if (object === "page" && change.field === "feed") {
          // Feed changes are informational; no status update needed
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── Event handlers ─────────────────────────────────────────────────────────────

async function handleMediaStatusChange(value: unknown): Promise<void> {
  const parsed = mediaStatusChangeSchema.safeParse(value);
  if (!parsed.success) return;

  const { media_id, post_id, status, error } = parsed.data;
  const platformPostId = media_id ?? post_id;
  if (!platformPostId) return;

  if (status === "PUBLISHED" || status === "FINISHED") {
    await prisma.publishResult.updateMany({
      where: { platformPostId },
      data: {
        status: PublishStatus.PUBLISHED,
        publishedAt: new Date(),
        error: null,
      },
    });
  } else if (status === "ERROR" || status === "EXPIRED") {
    const errorMessage = error?.message
      ? `Meta error ${error.code ?? ""}: ${error.message}`
      : `Media status: ${status}`;

    await prisma.publishResult.updateMany({
      where: { platformPostId },
      data: {
        status: PublishStatus.FAILED,
        error: errorMessage,
      },
    });
  }
}
