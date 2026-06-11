import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { handleRouteError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { generateDailyBriefing, type DailyBriefingData } from "@/lib/ai";
import { extractHashtags } from "@/lib/hashtag-analytics";

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayUTC(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

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

    const briefing = await prisma.dailyBriefing.findFirst({
      where: { userId: session.user.id },
      orderBy: { generatedAt: "desc" },
    });

    return NextResponse.json({ briefing });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(_request: NextRequest): Promise<NextResponse> {
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

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "AI features are not configured" },
        { status: 503 }
      );
    }

    const userId = session.user.id;
    const today = todayUTC();
    const yesterday = yesterdayUTC();

    const todayStart = new Date(`${today}T00:00:00.000Z`);
    const todayEnd = new Date(`${today}T23:59:59.999Z`);
    const yesterdayStart = new Date(`${yesterday}T00:00:00.000Z`);
    const yesterdayEnd = new Date(`${yesterday}T23:59:59.999Z`);
    const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Count posts scheduled today
    const todayScheduled = await prisma.post.count({
      where: {
        userId,
        status: { in: ["SCHEDULED", "PUBLISHING"] },
        scheduledAt: { gte: todayStart, lte: todayEnd },
      },
    });

    // Count posts scheduled this week
    const weekScheduled = await prisma.post.count({
      where: {
        userId,
        status: { in: ["SCHEDULED", "PUBLISHING"] },
        scheduledAt: { gte: todayStart, lte: weekEnd },
      },
    });

    // Yesterday's published stats
    const yesterdayResults = await prisma.publishResult.findMany({
      where: {
        post: { userId },
        status: "PUBLISHED",
        publishedAt: { gte: yesterdayStart, lte: yesterdayEnd },
      },
      include: {
        insights: true,
      },
    });

    const yesterdayPublished = new Set(yesterdayResults.map((r: (typeof yesterdayResults)[0]) => r.postId)).size;
    let totalEngagement = 0;
    const platformEngagement: Record<string, number> = {};

    for (const r of yesterdayResults) {
      if (r.insights) {
        const eng = r.insights.likes + r.insights.comments + r.insights.shares;
        totalEngagement += eng;
        platformEngagement[r.platform] = (platformEngagement[r.platform] ?? 0) + eng;
      }
    }

    const topPlatform =
      Object.keys(platformEngagement).length > 0
        ? Object.entries(platformEngagement).sort((a, b) => b[1] - a[1])[0][0]
        : null;

    // Find content gaps in the next 7 days
    const scheduledDates = await prisma.post.findMany({
      where: {
        userId,
        status: { in: ["SCHEDULED", "PUBLISHING"] },
        scheduledAt: { gte: todayStart, lte: weekEnd },
      },
      select: { scheduledAt: true },
    });

    const scheduledDaySet = new Set(
      scheduledDates
        .filter((p: (typeof scheduledDates)[0]) => p.scheduledAt)
        .map((p: (typeof scheduledDates)[0]) => p.scheduledAt!.toISOString().slice(0, 10))
    );

    const contentGaps: string[] = [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date(todayStart.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().slice(0, 10);
      if (!scheduledDaySet.has(dateStr)) {
        contentGaps.push(dateStr);
      }
    }

    // Top hashtags from recent published posts (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentPosts = await prisma.post.findMany({
      where: {
        userId,
        status: "PUBLISHED",
        updatedAt: { gte: thirtyDaysAgo },
      },
      select: { content: true },
      take: 100,
    });

    const hashtagCounts: Record<string, number> = {};
    for (const post of recentPosts) {
      const tags = extractHashtags(post.content);
      for (const tag of tags) {
        hashtagCounts[tag] = (hashtagCounts[tag] ?? 0) + 1;
      }
    }

    const topHashtags = Object.entries(hashtagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count]) => ({ tag, count }));

    const briefingData: DailyBriefingData = {
      todayScheduled,
      weekScheduled,
      yesterdayStats: {
        published: yesterdayPublished,
        totalEngagement,
        topPlatform,
      },
      contentGaps: contentGaps.slice(0, 5),
      topHashtags,
    };

    const result = await generateDailyBriefing(briefingData);
    if (!result) {
      return NextResponse.json(
        { error: "Failed to generate briefing" },
        { status: 500 }
      );
    }

    const briefing = await prisma.dailyBriefing.upsert({
      where: { userId_date: { userId, date: today } },
      create: {
        userId,
        date: today,
        todayScheduled,
        weekScheduled,
        yesterdayStats: briefingData.yesterdayStats,
        contentGaps,
        topHashtags,
        summary: result.summary,
        recommendations: result.recommendations,
      },
      update: {
        todayScheduled,
        weekScheduled,
        yesterdayStats: briefingData.yesterdayStats,
        contentGaps,
        topHashtags,
        summary: result.summary,
        recommendations: result.recommendations,
        generatedAt: new Date(),
      },
    });

    return NextResponse.json({ briefing });
  } catch (err) {
    return handleRouteError(err);
  }
}
