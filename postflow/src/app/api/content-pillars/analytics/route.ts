import { NextResponse } from "next/server";
import { PostStatus, PublishStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { computeScore } from "@/lib/content-score";

// ── GET /api/content-pillars/analytics ───────────────────────────────────────

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

    const pillars = await prisma.contentPillar.findMany({
      where: { userId: session.user.id, isActive: true },
      select: {
        id: true,
        name: true,
        color: true,
        posts: {
          select: {
            status: true,
            publishResults: {
              where: { status: PublishStatus.PUBLISHED },
              select: {
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
      orderBy: { name: "asc" },
    });

    const analytics = pillars.map((pillar) => {
      const postCount = pillar.posts.length;
      const publishedCount = pillar.posts.filter(
        (p) => p.status === PostStatus.PUBLISHED
      ).length;
      const scheduledCount = pillar.posts.filter(
        (p) => p.status === PostStatus.SCHEDULED
      ).length;

      let totalScore = 0;
      let scoredPosts = 0;

      for (const post of pillar.posts) {
        for (const result of post.publishResults) {
          if (result.insights) {
            totalScore += computeScore(result.insights);
            scoredPosts++;
          }
        }
      }

      const avgEngagementScore =
        scoredPosts > 0 ? Math.round(totalScore / scoredPosts) : 0;

      return {
        id: pillar.id,
        name: pillar.name,
        color: pillar.color,
        postCount,
        publishedCount,
        scheduledCount,
        avgEngagementScore,
      };
    });

    return NextResponse.json({ analytics });
  } catch (err) {
    return handleRouteError(err);
  }
}
