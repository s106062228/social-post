import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PostStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const querySchema = z.object({
  period: z.enum(["7d", "30d", "90d", "all"]).default("30d"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export interface TagPerformanceStat {
  tagId: string;
  tagName: string;
  tagColor: string;
  postCount: number;
  avgEngagement: number;
  totalEngagement: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalReach: number;
  totalImpressions: number;
}

export interface TagPerformanceResponse {
  period: string;
  tags: TagPerformanceStat[];
  totalTaggedPosts: number;
}

// ── GET /api/analytics/tag-performance ───────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
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

    const parsed = querySchema.safeParse({
      period: request.nextUrl.searchParams.get("period") ?? "30d",
      limit: request.nextUrl.searchParams.get("limit") ?? "20",
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { period, limit } = parsed.data;
    const userId = session.user.id;

    let cutoff: Date | null = null;
    if (period !== "all") {
      const daysBack = period === "7d" ? 7 : period === "30d" ? 30 : 90;
      cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - daysBack);
    }

    const postTags = await prisma.postTag.findMany({
      where: {
        post: {
          userId,
          status: PostStatus.PUBLISHED,
          ...(cutoff ? { updatedAt: { gte: cutoff } } : {}),
        },
      },
      include: {
        tag: true,
        post: {
          include: {
            publishResults: {
              include: { insights: true },
            },
          },
        },
      },
    });

    // Track unique post IDs across all tags
    const uniquePostIds = new Set<string>();
    postTags.forEach((pt) => uniquePostIds.add(pt.postId));

    // Aggregate per tag
    const tagMap = new Map<
      string,
      {
        tagId: string;
        tagName: string;
        tagColor: string;
        postIds: Set<string>;
        totalLikes: number;
        totalComments: number;
        totalShares: number;
        totalReach: number;
        totalImpressions: number;
        engagementSum: number;
        insightCount: number;
      }
    >();

    for (const pt of postTags) {
      const { tag, post } = pt;

      if (!tagMap.has(tag.id)) {
        tagMap.set(tag.id, {
          tagId: tag.id,
          tagName: tag.name,
          tagColor: tag.color,
          postIds: new Set(),
          totalLikes: 0,
          totalComments: 0,
          totalShares: 0,
          totalReach: 0,
          totalImpressions: 0,
          engagementSum: 0,
          insightCount: 0,
        });
      }

      const entry = tagMap.get(tag.id)!;
      entry.postIds.add(post.id);

      // Aggregate insights from all publish results of this post
      for (const pr of post.publishResults) {
        if (pr.insights) {
          const ins = pr.insights;
          const score =
            (ins.likes ?? 0) * 3 +
            (ins.comments ?? 0) * 5 +
            (ins.shares ?? 0) * 4 +
            (ins.reach ?? 0) +
            (ins.impressions ?? 0) * 0.5;

          entry.totalLikes += ins.likes ?? 0;
          entry.totalComments += ins.comments ?? 0;
          entry.totalShares += ins.shares ?? 0;
          entry.totalReach += ins.reach ?? 0;
          entry.totalImpressions += ins.impressions ?? 0;
          entry.engagementSum += score;
          entry.insightCount += 1;
        }
      }
    }

    // Build result array
    const stats: TagPerformanceStat[] = Array.from(tagMap.values()).map(
      (entry) => {
        const postCount = entry.postIds.size;
        const totalEngagement =
          entry.totalLikes * 3 +
          entry.totalComments * 5 +
          entry.totalShares * 4 +
          entry.totalReach +
          entry.totalImpressions * 0.5;
        const avgEngagement =
          entry.insightCount > 0
            ? entry.engagementSum / entry.insightCount
            : 0;

        return {
          tagId: entry.tagId,
          tagName: entry.tagName,
          tagColor: entry.tagColor,
          postCount,
          avgEngagement,
          totalEngagement,
          totalLikes: entry.totalLikes,
          totalComments: entry.totalComments,
          totalShares: entry.totalShares,
          totalReach: entry.totalReach,
          totalImpressions: entry.totalImpressions,
        };
      }
    );

    // Sort by avgEngagement descending, take top `limit`
    stats.sort((a, b) => b.avgEngagement - a.avgEngagement);
    const topStats = stats.slice(0, limit);

    return NextResponse.json({
      period,
      tags: topStats,
      totalTaggedPosts: uniquePostIds.size,
    } satisfies TagPerformanceResponse);
  } catch (err) {
    return handleRouteError(err);
  }
}
