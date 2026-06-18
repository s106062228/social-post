import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";
import { generateGrowthStrategy } from "@/lib/ai";
import { handleRouteError } from "@/lib/errors";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const schema = z.object({
  platforms: z.array(z.string()).min(1),
  goals: z.string().max(500).optional(),
  timeframe: z.enum(["30d", "90d"]).optional().default("30d"),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limited = await apiLimiter(req, session.user.id);
    if (limited) return limited;

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "AI features are not configured" },
        { status: 503 }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { platforms, goals, timeframe } = parsed.data;
    const userId = session.user.id;

    // Gather audience metrics
    const accounts = await db.socialAccount.findMany({
      where: { userId, isActive: true },
      include: {
        audienceMetrics: {
          orderBy: { syncedAt: "desc" },
          take: 1,
        },
      },
    });

    const followerCounts = accounts
      .filter((a) => a.audienceMetrics.length > 0)
      .map((a) => ({
        platform: a.platform,
        followers: a.audienceMetrics[0].followersCount ?? 0,
      }));

    // Compute avg engagement rate from last 30 days of PostInsights
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentInsights = await db.postInsights.findMany({
      where: {
        publishResult: {
          post: { userId },
          publishedAt: { gte: thirtyDaysAgo },
        },
        reach: { gt: 0 },
      },
      select: { likes: true, comments: true, shares: true, reach: true },
      take: 200,
    });

    const avgEngagementRate =
      recentInsights.length > 0
        ? recentInsights.reduce((sum, ins) => {
            const eng = ins.likes + ins.comments + ins.shares;
            return sum + (ins.reach > 0 ? (eng / ins.reach) * 100 : 0);
          }, 0) / recentInsights.length
        : 0;

    // Posts per week
    const recentPosts = await db.post.count({
      where: { userId, createdAt: { gte: thirtyDaysAgo } },
    });
    const postsPerWeek = recentPosts / 4.3;

    // Top content categories
    const categoryCounts = await db.post.groupBy({
      by: ["contentCategory"],
      where: {
        userId,
        contentCategory: { not: null },
        createdAt: { gte: thirtyDaysAgo },
      },
      _count: { contentCategory: true },
      orderBy: { _count: { contentCategory: "desc" } },
      take: 3,
    });

    const topCategories = categoryCounts
      .map((c) => c.contentCategory as string)
      .filter(Boolean);

    const result = await generateGrowthStrategy({
      platforms,
      followerCounts,
      avgEngagementRate,
      postsPerWeek,
      topCategories,
      goals,
      timeframe,
    });

    if (!result) {
      return NextResponse.json(
        { error: "Failed to generate growth strategy" },
        { status: 500 }
      );
    }

    return NextResponse.json({ strategy: result, generatedAt: new Date().toISOString() });
  } catch (err) {
    return handleRouteError(err);
  }
}
