import { type NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { PostStatus, MediaType } from "@prisma/client";

interface FieldMapping {
  contentField?: string;
  scheduledAtField?: string;
  mediaUrlsField?: string;
  titleField?: string;
}

function extractField(body: Record<string, unknown>, field: string | undefined): unknown {
  if (!field) return undefined;
  const parts = field.split(".");
  let value: unknown = body;
  for (const part of parts) {
    if (value === null || typeof value !== "object") return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

// ── POST /api/trigger/[id] ────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;

    // Rate limit by webhook ID (60 req/min per webhook)
    const rl = await rateLimit(`trigger:${id}`, { limit: 60, windowMs: 60_000 });
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    // Validate secret header
    const secret = request.headers.get("x-webhook-secret");
    if (!secret) {
      return NextResponse.json({ error: "Missing X-Webhook-Secret header" }, { status: 401 });
    }

    const webhook = await prisma.inboundWebhook.findUnique({ where: { id } });
    if (!webhook) {
      return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
    }

    if (!webhook.isActive) {
      return NextResponse.json({ error: "Webhook is inactive" }, { status: 403 });
    }

    // Constant-time comparison to prevent timing attacks
    const secretBuffer = Buffer.from(secret);
    const storedBuffer = Buffer.from(webhook.secret);
    const secretsMatch =
      secretBuffer.length === storedBuffer.length &&
      timingSafeEqual(secretBuffer, storedBuffer);

    if (!secretsMatch) {
      // Log failed attempt
      await prisma.webhookTriggerLog.create({
        data: {
          webhookId: id,
          success: false,
          statusCode: 401,
          errorMessage: "Invalid secret",
        },
      });
      return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
    }

    // Parse request body
    let body: Record<string, unknown> = {};
    try {
      const raw = await request.json();
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        body = raw as Record<string, unknown>;
      }
    } catch {
      // Empty body is fine; we'll use defaults
    }

    // Extract fields using field mapping
    const mapping = (webhook.fieldMapping as FieldMapping) ?? {};

    const contentRaw = extractField(body, mapping.contentField ?? "content");
    const titleRaw = extractField(body, mapping.titleField ?? "title");
    const scheduledAtRaw = extractField(body, mapping.scheduledAtField ?? "scheduledAt");
    const mediaUrlsRaw = extractField(body, mapping.mediaUrlsField ?? "mediaUrls");

    let content = typeof contentRaw === "string" ? contentRaw.trim() : "";

    // Prepend title if present
    if (typeof titleRaw === "string" && titleRaw.trim()) {
      content = titleRaw.trim() + (content ? "\n\n" + content : "");
    }

    if (!content) {
      await prisma.webhookTriggerLog.create({
        data: {
          webhookId: id,
          success: false,
          statusCode: 422,
          requestBody: body,
          errorMessage: "No content extracted from payload",
        },
      });
      return NextResponse.json({ error: "No content extracted from payload" }, { status: 422 });
    }

    // Parse scheduledAt
    let scheduledAt: Date | null = null;
    let status: PostStatus = PostStatus.DRAFT;
    if (scheduledAtRaw) {
      const parsed = new Date(scheduledAtRaw as string);
      if (!isNaN(parsed.getTime()) && parsed > new Date()) {
        scheduledAt = parsed;
        status = PostStatus.SCHEDULED;
      }
    }

    // Parse mediaUrls
    let mediaUrls: string[] = [];
    if (Array.isArray(mediaUrlsRaw)) {
      mediaUrls = mediaUrlsRaw.filter((u) => typeof u === "string") as string[];
    } else if (typeof mediaUrlsRaw === "string" && mediaUrlsRaw) {
      mediaUrls = [mediaUrlsRaw];
    }

    const mediaType = mediaUrls.length > 0 ? MediaType.IMAGE : MediaType.NONE;

    // Create the post
    const post = await prisma.post.create({
      data: {
        userId: webhook.userId,
        content,
        mediaType,
        mediaUrls,
        status,
        scheduledAt,
      },
      select: { id: true, status: true },
    });

    // Update webhook stats and log success
    await Promise.all([
      prisma.inboundWebhook.update({
        where: { id },
        data: {
          lastTriggeredAt: new Date(),
          triggerCount: { increment: 1 },
        },
      }),
      prisma.webhookTriggerLog.create({
        data: {
          webhookId: id,
          success: true,
          statusCode: 201,
          requestBody: body,
        },
      }),
    ]);

    return NextResponse.json({ postId: post.id, status: post.status }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
