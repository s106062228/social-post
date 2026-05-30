import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { PostStatus } from "@prisma/client";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  try {
    const { slug } = await params;

    const portal = await prisma.clientPortal.findUnique({
      where: { slug },
      select: {
        userId: true,
        isPublished: true,
        showAnalytics: true,
        expiresAt: true,
      },
    });

    if (!portal || !portal.isPublished) {
      return NextResponse.json({ error: "Portal not found" }, { status: 404 });
    }

    if (portal.expiresAt && portal.expiresAt < new Date()) {
      return NextResponse.json({ error: "Portal has expired" }, { status: 410 });
    }

    if (!portal.showAnalytics) {
      return NextResponse.json({ error: "Analytics not enabled for this portal" }, { status: 403 });
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [totalPublished, scheduledCount, publishResults, recentPosts] = await Promise.all([
      prisma.post.count({
        where: { userId: portal.userId, status: PostStatus.PUBLISHED },
      }),
      prisma.post.count({
        where: { userId: portal.userId, status: PostStatus.SCHEDULED },
      }),
      prisma.publishResult.findMany({
        where: {
          post: { userId: portal.userId },
          status: "PUBLISHED",
          publishedAt: { gte: thirtyDaysAgo },
        },
        select: { platform: true },
      }),
      prisma.post.findMany({
        where: {
          userId: portal.userId,
          status: PostStatus.PUBLISHED,
          updatedAt: { gte: thirtyDaysAgo },
        },
        select: { updatedAt: true },
        orderBy: { updatedAt: "asc" },
      }),
    ]);

    // Platform breakdown
    const platformCounts: Record<string, number> = {};
    for (const r of publishResults) {
      platformCounts[r.platform] = (platformCounts[r.platform] ?? 0) + 1;
    }
    const platformBreakdown = Object.entries(platformCounts)
      .map(([platform, count]) => ({ platform, count }))
      .sort((a, b) => b.count - a.count);

    // Daily activity for last 30 days
    const dailyMap: Record<string, number> = {};
    for (let i = 0; i < 30; i++) {
      const d = new Date(thirtyDaysAgo);
      d.setDate(d.getDate() + i);
      dailyMap[d.toISOString().slice(0, 10)] = 0;
    }
    for (const p of recentPosts) {
      const key = p.updatedAt.toISOString().slice(0, 10);
      if (key in dailyMap) {
        dailyMap[key] = (dailyMap[key] ?? 0) + 1;
      }
    }
    const last30DayActivity = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    return NextResponse.json({
      totalPublished,
      scheduledCount,
      platformBreakdown,
      last30DayActivity,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
