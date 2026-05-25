import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PostStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { detectConflicts, buildResolutionPlan } from "@/lib/schedule-conflicts";
import { logActivity } from "@/lib/activity-log";

const resolveSchema = z.object({
  windowMinutes: z.number().int().min(1).max(1440).default(30),
  spacingMinutes: z.number().int().min(1).max(10080).default(30),
});

// ── POST /api/posts/resolve-conflicts ─────────────────────────────────────────

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
      body = {};
    }

    const parsed = resolveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { windowMinutes, spacingMinutes } = parsed.data;

    const scheduledPosts = await prisma.post.findMany({
      where: {
        userId: session.user.id,
        status: PostStatus.SCHEDULED,
        scheduledAt: { not: null },
        archivedAt: null,
      },
      select: {
        id: true,
        scheduledAt: true,
        publishResults: { select: { platform: true } },
      },
      orderBy: { scheduledAt: "asc" },
    });

    const postsWithDates = scheduledPosts.map((p) => ({ ...p, scheduledAt: p.scheduledAt! }));
    const conflicts = detectConflicts(postsWithDates, windowMinutes);

    if (conflicts.length === 0) {
      return NextResponse.json({ resolved: 0, updates: [] });
    }

    const plan = buildResolutionPlan(postsWithDates, conflicts, spacingMinutes);

    if (plan.length === 0) {
      return NextResponse.json({ resolved: 0, updates: [] });
    }

    await prisma.$transaction(
      plan.map((item) =>
        prisma.post.update({
          where: { id: item.postId, userId: session.user.id },
          data: { scheduledAt: item.newScheduledAt },
        })
      )
    );

    logActivity({
      userId: session.user.id,
      action: "post.conflicts_resolved",
      entityId: plan[0].postId,
      entityType: "post",
      metadata: { resolved: plan.length, windowMinutes, spacingMinutes },
    });

    return NextResponse.json({
      resolved: plan.length,
      updates: plan.map((item) => ({
        postId: item.postId,
        newScheduledAt: item.newScheduledAt.toISOString(),
      })),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
