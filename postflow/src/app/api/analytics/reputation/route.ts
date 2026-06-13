import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const VALID_PERIODS = ["7d", "30d", "90d"] as const;
type Period = (typeof VALID_PERIODS)[number];

function periodToDays(period: Period): number {
  if (period === "7d") return 7;
  if (period === "90d") return 90;
  return 30;
}

function computeReputationScore(positive: number, neutral: number, negative: number): number {
  const total = positive + neutral + negative;
  if (total === 0) return 0;
  const posRate = positive / total;
  const negRate = negative / total;
  const score = posRate * 100 - negRate * 50;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function computeTrend(
  comments: { postedAt: Date; sentiment: string }[],
  cutoff: Date
): "improving" | "stable" | "declining" {
  if (comments.length < 4) return "stable";

  const mid = new Date((cutoff.getTime() + Date.now()) / 2);
  const firstHalf = comments.filter((c) => c.postedAt >= cutoff && c.postedAt < mid);
  const secondHalf = comments.filter((c) => c.postedAt >= mid);

  function sentimentScore(group: { sentiment: string }[]): number {
    if (group.length === 0) return 50;
    const pos = group.filter((c) => c.sentiment === "POSITIVE").length;
    const neg = group.filter((c) => c.sentiment === "NEGATIVE").length;
    return computeReputationScore(pos, group.length - pos - neg, neg);
  }

  const firstScore = sentimentScore(firstHalf);
  const secondScore = sentimentScore(secondHalf);

  if (secondScore - firstScore > 5) return "improving";
  if (firstScore - secondScore > 5) return "declining";
  return "stable";
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const rl = await apiLimiter(userId);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  const { searchParams } = new URL(req.url);
  const periodParam = searchParams.get("period") ?? "30d";
  if (!VALID_PERIODS.includes(periodParam as Period)) {
    return NextResponse.json({ error: "Invalid period. Use 7d, 30d, or 90d" }, { status: 400 });
  }
  const period = periodParam as Period;
  const days = periodToDays(period);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const comments = await prisma.socialComment.findMany({
      where: {
        userId,
        postedAt: { gte: cutoff },
        sentiment: { not: null },
      },
      select: { postedAt: true, sentiment: true },
      orderBy: { postedAt: "asc" },
    });

    const totalComments = await prisma.socialComment.count({
      where: { userId, postedAt: { gte: cutoff } },
    });

    const positive = comments.filter((c) => c.sentiment === "POSITIVE").length;
    const neutral = comments.filter((c) => c.sentiment === "NEUTRAL").length;
    const negative = comments.filter((c) => c.sentiment === "NEGATIVE").length;
    const analyzedCount = comments.length;

    const reputationScore = computeReputationScore(positive, neutral, negative);
    const trend = computeTrend(
      comments as { postedAt: Date; sentiment: string }[],
      cutoff
    );

    // Build daily breakdown for last 30 days (fixed window for chart)
    const chartDays = 30;
    const chartCutoff = new Date(Date.now() - chartDays * 24 * 60 * 60 * 1000);
    const recentComments = comments.filter((c) => c.postedAt >= chartCutoff);

    const dailyMap = new Map<string, { positive: number; neutral: number; negative: number }>();
    for (let i = 0; i < chartDays; i++) {
      const d = new Date(chartCutoff.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().slice(0, 10);
      dailyMap.set(dateStr, { positive: 0, neutral: 0, negative: 0 });
    }

    for (const c of recentComments) {
      const dateStr = (c.postedAt as Date).toISOString().slice(0, 10);
      const entry = dailyMap.get(dateStr);
      if (entry) {
        if (c.sentiment === "POSITIVE") entry.positive++;
        else if (c.sentiment === "NEGATIVE") entry.negative++;
        else entry.neutral++;
      }
    }

    const dailyBreakdown = Array.from(dailyMap.entries()).map(([date, counts]) => ({
      date,
      ...counts,
    }));

    return NextResponse.json({
      period,
      reputationScore,
      trend,
      distribution: { positive, neutral, negative, total: analyzedCount },
      dailyBreakdown,
      analyzedCount,
      totalCount: totalComments,
    });
  } catch (err) {
    console.error("reputation analytics error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
