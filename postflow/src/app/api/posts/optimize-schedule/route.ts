import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PostStatus, PublishStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-log";
import { optimizeSchedule } from "@/lib/schedule-optimizer";
import type { PostData } from "@/lib/correlation";

const bodySchema = z.object({
  dryRun: z.boolean().default(true),
  windowDays: z.number().int().min(1).max(60).default(30),
});

export interface OptimizeProposalJson {
  postId: string;
  currentScheduledAt: string;
  proposedScheduledAt: string;
  reason: string;
  improvementFactor: number;
}

export interface OptimizeScheduleResponse {
  proposals: OptimizeProposalJson[];
  totalScheduled: number;
  optimized: number;
  dryRun: boolean;
}

// ── POST /api/posts/optimize-schedule ────────────────────────────────────────

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

    const body: unknown = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { dryRun, windowDays } = parsed.data;
    const userId = session.user.id;
    const now = new Date();
    const horizon = new Date(now.getTime() + windowDays * 86_400_000);

    // Load SCHEDULED posts within the window
    const scheduledPosts = await prisma.post.findMany({
      where: {
        userId,
        status: PostStatus.SCHEDULED,
        scheduledAt: { gte: now, lte: horizon },
      },
      select: {
        id: true,
        scheduledAt: true,
        content: true,
        mediaType: true,
        contentCategory: true,
      },
    });

    // Load 90-day historical posts with insights for correlation analysis
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 86_400_000);
    const historicalRaw = await prisma.post.findMany({
      where: {
        userId,
        status: PostStatus.PUBLISHED,
        updatedAt: { gte: ninetyDaysAgo },
      },
      select: {
        content: true,
        mediaType: true,
        contentCategory: true,
        publishResults: {
          where: { status: PublishStatus.PUBLISHED, publishedAt: { not: null } },
          select: {
            publishedAt: true,
            insights: {
              select: { likes: true, comments: true, shares: true },
            },
          },
        },
      },
    });

    const historicalPosts: PostData[] = historicalRaw.flatMap((p) =>
      p.publishResults
        .filter((pr) => pr.publishedAt !== null && pr.insights !== null)
        .map((pr) => ({
          content: p.content,
          mediaType: p.mediaType,
          contentCategory: p.contentCategory as string | null,
          publishedAt: pr.publishedAt as Date,
          totalEngagement:
            (pr.insights?.likes ?? 0) +
            (pr.insights?.comments ?? 0) +
            (pr.insights?.shares ?? 0),
        }))
    );

    const scheduledInputs = scheduledPosts
      .filter((p) => p.scheduledAt !== null)
      .map((p) => ({
        id: p.id,
        scheduledAt: p.scheduledAt as Date,
        content: p.content,
        mediaType: p.mediaType,
        contentCategory: p.contentCategory as string | null,
      }));

    const proposals = optimizeSchedule(scheduledInputs, historicalPosts, {
      windowDays,
    });

    if (!dryRun && proposals.length > 0) {
      await prisma.$transaction(
        proposals.map((p) =>
          prisma.post.update({
            where: { id: p.postId },
            data: { scheduledAt: p.proposedScheduledAt },
          })
        )
      );

      logActivity({
        userId,
        action: "post.schedule_optimized",
        entityId: proposals[0].postId,
        entityType: "post",
        metadata: { count: proposals.length },
      });
    }

    return NextResponse.json({
      proposals: proposals.map((p) => ({
        postId: p.postId,
        currentScheduledAt: p.currentScheduledAt.toISOString(),
        proposedScheduledAt: p.proposedScheduledAt.toISOString(),
        reason: p.reason,
        improvementFactor: p.improvementFactor,
      })),
      totalScheduled: scheduledPosts.length,
      optimized: dryRun ? 0 : proposals.length,
      dryRun,
    } satisfies OptimizeScheduleResponse);
  } catch (err) {
    return handleRouteError(err);
  }
}
