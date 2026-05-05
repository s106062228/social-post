import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import type { IntegrationEvent } from "@/lib/slack-notify";

const VALID_EVENTS: IntegrationEvent[] = [
  "post.published",
  "post.failed",
  "post.partially_published",
];

const createSchema = z.object({
  channelName: z.string().min(1).max(100),
  webhookUrl: z
    .string()
    .url("Must be a valid URL")
    .refine((u) => u.startsWith("https://"), "URL must use HTTPS"),
  events: z
    .array(
      z.enum(["post.published", "post.failed", "post.partially_published"])
    )
    .min(1, "At least one event is required"),
});

// ── GET /api/integrations/discord ────────────────────────────────────────────

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

    const integrations = await prisma.discordIntegration.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        channelName: true,
        webhookUrl: true,
        events: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ integrations, validEvents: VALID_EVENTS });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/integrations/discord ───────────────────────────────────────────

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
        {
          error: "Validation failed",
          issues: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { channelName, webhookUrl, events } = parsed.data;

    const integration = await prisma.discordIntegration.create({
      data: { userId: session.user.id, channelName, webhookUrl, events },
      select: {
        id: true,
        channelName: true,
        webhookUrl: true,
        events: true,
        isActive: true,
        createdAt: true,
      },
    });

    return NextResponse.json(integration, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
