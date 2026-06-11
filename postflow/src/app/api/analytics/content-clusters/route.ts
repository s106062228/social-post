import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PublishStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { clusterPostsByTopic, type TopicCluster } from "@/lib/content-clustering";

const querySchema = z.object({
  period: z.enum(["30d", "90d", "all"]).default("30d"),
  maxClusters: z.coerce.number().int().min(1).max(20).default(12),
});

export interface ContentClustersResponse {
  period: string;
  clusters: TopicCluster[];
  totalPosts: number;
  uncategorizedCount: number;
}

// ── GET /api/analytics/content-clusters ───────────────────────────────────────

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
      maxClusters: request.nextUrl.searchParams.get("maxClusters") ?? "12",
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { period, maxClusters } = parsed.data;
    const userId = session.user.id;

    const daysBack = period === "30d" ? 30 : period === "90d" ? 90 : null;
    const since = daysBack
      ? new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)
      : null;

    const posts = await prisma.post.findMany({
      where: {
        userId,
        status: "PUBLISHED",
        ...(since ? { updatedAt: { gte: since } } : {}),
      },
      select: {
        id: true,
        content: true,
        publishResults: {
          where: { status: PublishStatus.PUBLISHED },
          select: {
            insights: {
              select: {
                likes: true,
                comments: true,
                shares: true,
              },
            },
          },
        },
      },
    });

    // Compute aggregate engagement per post across all platform results
    const postData = posts.map((post) => {
      let totalEngagement = 0;
      for (const pr of post.publishResults) {
        if (pr.insights) {
          totalEngagement +=
            pr.insights.likes + pr.insights.comments + pr.insights.shares;
        }
      }
      return {
        id: post.id,
        content: post.content,
        engagement: totalEngagement,
      };
    });

    const result = clusterPostsByTopic(postData, maxClusters);

    return NextResponse.json({
      period,
      clusters: result.clusters,
      totalPosts: result.totalPosts,
      uncategorizedCount: result.uncategorizedCount,
    } satisfies ContentClustersResponse);
  } catch (err) {
    return handleRouteError(err);
  }
}
