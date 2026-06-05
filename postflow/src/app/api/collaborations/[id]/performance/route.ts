import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

type RouteContext = { params: Promise<{ id: string }> };

// ── GET /api/collaborations/[id]/performance ──────────────────────────────────

export async function GET(
  _request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
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

    const { id } = await context.params;

    const collaboration = await prisma.collaboration.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true, name: true, partnerName: true, status: true },
    });
    if (!collaboration) {
      return NextResponse.json({ error: "Collaboration not found" }, { status: 404 });
    }

    const collabPosts = await prisma.collaborationPost.findMany({
      where: { collaborationId: id },
      select: {
        post: {
          select: {
            id: true,
            content: true,
            status: true,
            publishResults: {
              where: { status: "PUBLISHED" },
              select: {
                publishedAt: true,
                insights: {
                  select: {
                    impressions: true,
                    reach: true,
                    likes: true,
                    comments: true,
                    shares: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    let totalImpressions = 0;
    let totalReach = 0;
    let totalLikes = 0;
    let totalComments = 0;
    let totalShares = 0;
    let publishedCount = 0;

    const postEngagements: { postId: string; content: string; publishedAt: Date | null; engagement: number }[] = [];

    for (const cp of collabPosts) {
      const post = cp.post;
      if (post.status !== "PUBLISHED") continue;
      publishedCount++;

      let postEngagement = 0;
      let postImpression = 0;
      let postReach = 0;
      let postLikes = 0;
      let postComments = 0;
      let postShares = 0;
      let firstPublishedAt: Date | null = null;

      for (const pr of post.publishResults) {
        if (pr.publishedAt && (!firstPublishedAt || pr.publishedAt < firstPublishedAt)) {
          firstPublishedAt = pr.publishedAt;
        }
        for (const insight of pr.insights) {
          postImpression += insight.impressions ?? 0;
          postReach += insight.reach ?? 0;
          postLikes += insight.likes ?? 0;
          postComments += insight.comments ?? 0;
          postShares += insight.shares ?? 0;
          postEngagement += (insight.likes ?? 0) + (insight.comments ?? 0) + (insight.shares ?? 0);
        }
      }

      totalImpressions += postImpression;
      totalReach += postReach;
      totalLikes += postLikes;
      totalComments += postComments;
      totalShares += postShares;

      postEngagements.push({
        postId: post.id,
        content: post.content.slice(0, 100),
        publishedAt: firstPublishedAt,
        engagement: postEngagement,
      });
    }

    const totalEngagement = totalLikes + totalComments + totalShares;
    const avgEngagement = publishedCount > 0 ? Math.round(totalEngagement / publishedCount) : 0;

    const topPosts = postEngagements
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, 5);

    return NextResponse.json({
      collaboration,
      performance: {
        totalPosts: publishedCount,
        totalImpressions,
        totalReach,
        totalLikes,
        totalComments,
        totalShares,
        totalEngagement,
        avgEngagement,
      },
      topPosts,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
