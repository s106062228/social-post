import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-log";

const pauseSchema = z.object({
  paused: z.boolean(),
  reason: z.string().max(500).optional(),
});

// ── GET /api/settings/publishing-pause ────────────────────────────────────────

export async function GET(_request: NextRequest): Promise<NextResponse> {
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

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        publishingPaused: true,
        publishingPausedReason: true,
        publishingPausedAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      paused: user.publishingPaused,
      reason: user.publishingPausedReason ?? null,
      pausedAt: user.publishingPausedAt ?? null,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── PATCH /api/settings/publishing-pause ──────────────────────────────────────

export async function PATCH(request: NextRequest): Promise<NextResponse> {
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

    const parsed = pauseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { paused, reason } = parsed.data;

    const updateData = paused
      ? {
          publishingPaused: true,
          publishingPausedReason: reason ?? null,
          publishingPausedAt: new Date(),
        }
      : {
          publishingPaused: false,
          publishingPausedReason: null,
          publishingPausedAt: null,
        };

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
      select: {
        publishingPaused: true,
        publishingPausedReason: true,
        publishingPausedAt: true,
      },
    });

    logActivity({
      userId: session.user.id,
      action: paused ? "publishing.paused" : "publishing.resumed",
      metadata: paused ? { reason: reason ?? null } : {},
    });

    return NextResponse.json({
      paused: user.publishingPaused,
      reason: user.publishingPausedReason ?? null,
      pausedAt: user.publishingPausedAt ?? null,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
