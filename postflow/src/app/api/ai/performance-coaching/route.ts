import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import {
  generatePerformanceCoaching,
  type CoachingMetrics,
  type CoachingGoal,
} from "@/lib/ai";

function getWeekStart(): Date {
  const now = new Date();
  const day = now.getUTCDay(); // 0 = Sunday
  const diff = day === 0 ? 6 : day - 1; // Make Monday the start
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - diff);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

export async function GET(_req: NextRequest): Promise<NextResponse> {
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

    const coaching = await prisma.coachingInsight.findFirst({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ coaching: coaching ?? null });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(_req: NextRequest): Promise<NextResponse> {
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
        { error: "AI features not configured" },
        { status: 503 }
      );
    }

    const weekOf = getWeekStart();
    const since = new Date(weekOf.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Gather weekly metrics
    const [publishResults, goalProgress] = await Promise.all([
      prisma.publishResult.findMany({
        where: {
          post: { userId: session.user.id },
          status: "PUBLISHED",
          publishedAt: { gte: since },
        },
        include: {
          post: { select: { content: true } },
          insights: true,
        },
      }),
      prisma.postingGoal.findMany({
        where: { userId: session.user.id, isActive: true },
        select: {
          name: true,
          period: true,
          targetCount: true,
        },
      }),
    ]);

    const postsPublished = new Set(publishResults.map((r) => r.postId)).size;

    // Compute engagement scores per post
    type ScoredPost = { postId: string; content: string; score: number; platform: string; likes: number; comments: number; shares: number; reach: number };
    const scoredPosts: ScoredPost[] = publishResults.map((r) => {
      const ins = r.insights;
      const score = ins
        ? ins.likes * 3 + ins.comments * 5 + ins.shares * 4 + ins.reach * 1 + ins.impressions * 0.5
        : 0;
      return {
        postId: r.postId,
        content: r.post.content,
        score,
        platform: r.platform,
        likes: ins?.likes ?? 0,
        comments: ins?.comments ?? 0,
        shares: ins?.shares ?? 0,
        reach: ins?.reach ?? 0,
      };
    });

    const avgEngagementScore =
      scoredPosts.length > 0
        ? scoredPosts.reduce((s, p) => s + p.score, 0) / scoredPosts.length
        : 0;

    const sorted = [...scoredPosts].sort((a, b) => b.score - a.score);
    const topPost = sorted[0]
      ? { content: sorted[0].content, score: sorted[0].score }
      : null;
    const bottomPost = sorted[sorted.length - 1] && sorted.length > 1
      ? { content: sorted[sorted.length - 1].content, score: sorted[sorted.length - 1].score }
      : null;

    const metrics: CoachingMetrics = {
      postsPublished,
      avgEngagementScore,
      topPost,
      bottomPost,
    };

    // Build goal progress
    const goals: CoachingGoal[] = await Promise.all(
      goalProgress.map(async (g) => {
        let periodStart = new Date();
        if (g.period === "DAILY") {
          periodStart = new Date();
          periodStart.setUTCHours(0, 0, 0, 0);
        } else if (g.period === "WEEKLY") {
          periodStart = weekOf;
        } else {
          periodStart = new Date();
          periodStart.setUTCDate(1);
          periodStart.setUTCHours(0, 0, 0, 0);
        }

        const count = await prisma.publishResult.count({
          where: {
            post: { userId: session.user.id },
            status: "PUBLISHED",
            publishedAt: { gte: periodStart },
          },
        });

        return {
          name: g.name,
          period: g.period,
          targetCount: g.targetCount,
          publishedCount: count,
          onTrack: count >= g.targetCount,
        };
      })
    );

    // Aggregate recent insights by platform
    const platformMap = new Map<string, { likes: number; comments: number; shares: number; reach: number }>();
    for (const p of scoredPosts) {
      const existing = platformMap.get(p.platform) ?? { likes: 0, comments: 0, shares: 0, reach: 0 };
      platformMap.set(p.platform, {
        likes: existing.likes + p.likes,
        comments: existing.comments + p.comments,
        shares: existing.shares + p.shares,
        reach: existing.reach + p.reach,
      });
    }
    const recentInsights = Array.from(platformMap.entries()).map(([platform, data]) => ({
      platform,
      ...data,
    }));

    const result = await generatePerformanceCoaching(metrics, goals, recentInsights);
    if (!result) {
      return NextResponse.json(
        { error: "AI coaching generation failed" },
        { status: 503 }
      );
    }

    const coaching = await prisma.coachingInsight.create({
      data: {
        userId: session.user.id,
        weekOf,
        summary: result.summary,
        highlights: result.highlights,
        improvements: result.improvements,
        nextWeekFocus: result.nextWeekFocus,
        overallScore: result.overallScore,
      },
    });

    return NextResponse.json({ coaching, weekOf: weekOf.toISOString() });
  } catch (err) {
    return handleRouteError(err);
  }
}
