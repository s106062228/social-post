import { type NextRequest, NextResponse } from "next/server";
import { Platform, PostStatus, PublishStatus } from "@prisma/client";
import { z } from "zod";

type PublishResultRow = { platform: string; status: string; publishedAt: Date | null };
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const querySchema = z.object({
  period: z.enum(["7d", "30d", "90d"]).default("30d"),
});

// ── GET /api/analytics/dashboard ─────────────────────────────────────────────

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
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }

    const { period } = parsed.data;
    const userId = session.user.id;

    const daysBack = period === "7d" ? 7 : period === "30d" ? 30 : 90;
    const since = new Date();
    since.setDate(since.getDate() - daysBack);
    since.setHours(0, 0, 0, 0);

    const [
      totalPosts,
      publishedCount,
      failedCount,
      scheduledCount,
      draftCount,
      recentPosts,
      publishResults,
    ] = await Promise.all([
      prisma.post.count({ where: { userId } }),
      prisma.post.count({ where: { userId, status: PostStatus.PUBLISHED } }),
      prisma.post.count({ where: { userId, status: PostStatus.FAILED } }),
      prisma.post.count({ where: { userId, status: PostStatus.SCHEDULED } }),
      prisma.post.count({ where: { userId, status: PostStatus.DRAFT } }),
      prisma.post.findMany({
        where: { userId, createdAt: { gte: since } },
        select: { createdAt: true, status: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.publishResult.findMany({
        where: { post: { userId }, createdAt: { gte: since } },
        select: { platform: true, status: true, publishedAt: true },
      }) as Promise<PublishResultRow[]>,
    ]);

    // --- Daily time series ---
    const dailyMap: Record<string, { created: number; published: number; failed: number }> = {};
    for (let i = 0; i < daysBack; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      dailyMap[key] = { created: 0, published: 0, failed: 0 };
    }
    for (const post of recentPosts) {
      const key = post.createdAt.toISOString().slice(0, 10);
      if (dailyMap[key]) {
        dailyMap[key].created += 1;
        if (post.status === PostStatus.PUBLISHED) dailyMap[key].published += 1;
        if (post.status === PostStatus.FAILED) dailyMap[key].failed += 1;
      }
    }
    const timeSeries = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({ date, ...counts }));

    // --- Platform distribution ---
    const platformDist = Object.values(Platform).map((platform) => {
      const results = publishResults.filter((r) => r.platform === platform);
      const published = results.filter((r) => r.status === PublishStatus.PUBLISHED).length;
      const failed = results.filter((r) => r.status === PublishStatus.FAILED).length;
      const pending = results.filter(
        (r) => r.status === PublishStatus.PENDING || r.status === PublishStatus.PROCESSING
      ).length;
      return { platform, published, failed, pending, total: results.length };
    });

    // --- Hourly activity heatmap (0-23) ---
    const hourlyMap: Record<number, number> = {};
    for (let h = 0; h < 24; h++) hourlyMap[h] = 0;
    for (const post of recentPosts) {
      const hour = post.createdAt.getUTCHours();
      hourlyMap[hour] = (hourlyMap[hour] ?? 0) + 1;
    }
    const hourlyActivity = Object.entries(hourlyMap)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([hour, count]) => ({ hour: Number(hour), count }));

    // --- KPIs ---
    const totalPublishResults = publishResults.length;
    const totalPublished = publishResults.filter(
      (r) => r.status === PublishStatus.PUBLISHED
    ).length;
    const overallSuccessRate =
      totalPublishResults > 0
        ? Math.round((totalPublished / totalPublishResults) * 100)
        : 0;

    return NextResponse.json({
      period,
      kpis: {
        total: totalPosts,
        published: publishedCount,
        failed: failedCount,
        scheduled: scheduledCount,
        draft: draftCount,
        successRate: overallSuccessRate,
      },
      timeSeries,
      platformDist,
      hourlyActivity,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
