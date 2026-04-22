import { type NextRequest, NextResponse } from "next/server";
import { Platform, PostStatus, PublishStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

// ── GET /api/analytics/summary ────────────────────────────────────────────────

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

    const userId = session.user.id;

    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const [
      totalPosts,
      publishedPosts,
      failedPosts,
      scheduledPosts,
      draftPosts,
      publishingPosts,
      partialPosts,
      allPublishResults,
      recentPosts,
    ] = await Promise.all([
      prisma.post.count({ where: { userId } }),
      prisma.post.count({ where: { userId, status: PostStatus.PUBLISHED } }),
      prisma.post.count({ where: { userId, status: PostStatus.FAILED } }),
      prisma.post.count({ where: { userId, status: PostStatus.SCHEDULED } }),
      prisma.post.count({ where: { userId, status: PostStatus.DRAFT } }),
      prisma.post.count({ where: { userId, status: PostStatus.PUBLISHING } }),
      prisma.post.count({ where: { userId, status: PostStatus.PARTIALLY_PUBLISHED } }),
      prisma.publishResult.findMany({
        where: { post: { userId } },
        select: { platform: true, status: true },
      }),
      prisma.post.findMany({
        where: { userId, createdAt: { gte: fourteenDaysAgo } },
        select: { createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    // Platform breakdown
    const platforms = Object.values(Platform).map((platform) => {
      const results = allPublishResults.filter((r) => r.platform === platform);
      const published = results.filter((r) => r.status === PublishStatus.PUBLISHED).length;
      const failed = results.filter((r) => r.status === PublishStatus.FAILED).length;
      const pending = results.filter(
        (r) => r.status === PublishStatus.PENDING || r.status === PublishStatus.PROCESSING
      ).length;
      const total = results.length;
      const successRate = total > 0 ? Math.round((published / total) * 100) : 0;
      return { platform, published, failed, pending, total, successRate };
    });

    const totalPublishResults = allPublishResults.length;
    const totalPublished = allPublishResults.filter(
      (r) => r.status === PublishStatus.PUBLISHED
    ).length;
    const overallSuccessRate =
      totalPublishResults > 0
        ? Math.round((totalPublished / totalPublishResults) * 100)
        : 0;

    // Posts per day for last 14 days
    const dailyCounts: Record<string, number> = {};
    for (const post of recentPosts) {
      const day = post.createdAt.toISOString().slice(0, 10);
      dailyCounts[day] = (dailyCounts[day] ?? 0) + 1;
    }
    const dailyActivity = Object.entries(dailyCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    return NextResponse.json({
      posts: {
        total: totalPosts,
        draft: draftPosts,
        scheduled: scheduledPosts,
        publishing: publishingPosts,
        published: publishedPosts,
        partiallyPublished: partialPosts,
        failed: failedPosts,
      },
      publishResults: {
        total: totalPublishResults,
        published: totalPublished,
        failed: allPublishResults.filter((r) => r.status === PublishStatus.FAILED).length,
        overallSuccessRate,
      },
      platforms,
      dailyActivity,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
