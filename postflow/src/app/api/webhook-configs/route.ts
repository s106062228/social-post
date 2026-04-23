import crypto from "crypto";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import type { WebhookEvent } from "@/lib/webhook-dispatch";

const VALID_EVENTS: WebhookEvent[] = [
  "post.published",
  "post.failed",
  "post.partially_published",
];

const createSchema = z.object({
  url: z.string().url("Must be a valid HTTPS URL").refine(
    (u) => u.startsWith("https://"),
    "URL must use HTTPS"
  ),
  events: z
    .array(z.enum(["post.published", "post.failed", "post.partially_published"]))
    .min(1, "At least one event is required"),
});

// ── GET /api/webhook-configs ──────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await apiLimiter(session.user.id);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    const configs = await prisma.webhookConfig.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        url: true,
        events: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ configs, validEvents: VALID_EVENTS });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/webhook-configs ─────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await apiLimiter(session.user.id);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { url, events } = parsed.data;
    const secret = crypto.randomBytes(32).toString("hex");

    const config = await prisma.webhookConfig.create({
      data: { userId: session.user.id, url, events, secret },
      select: {
        id: true,
        url: true,
        events: true,
        secret: true,
        isActive: true,
        createdAt: true,
      },
    });

    return NextResponse.json(config, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
