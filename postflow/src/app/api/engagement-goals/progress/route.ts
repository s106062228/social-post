import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import {
  GoalPeriod,
  Platform,
  PublishStatus,
  EngagementMetric,
  EngagementAggregation,
} from "@prisma/client";
import { computeScore } from "@/lib/content-score";

// ── Period window helpers ──────────────────────────────────────────────────────

function getPeriodWindow(period: GoalPeriod): { from: Date; to: Date } {
  const now = new Date();

  if (period === GoalPeriod.DAILY) {
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    const to = new Date(now);
    to.setHours(23, 59, 59, 999);
    return { from, to };
  }

  if (period === GoalPeriod.WEEKLY) {
    const from = new Date(now);
    const day = from.getDay(); // 0=Sun
    from.setDate(from.getDate() - day);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(from.getDate() + 6);
    to.setHours(23, 59, 59, 999);
    return { from, to };
  }

  // MONTHLY
  const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const to = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  );
  return { from, to };
}

// ── Metric extractor ───────────────────────────────────────────────────────────

interface InsightValues {
  impressions: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
}

function extractMetricValue(
  insight: InsightValues,
  metric: EngagementMetric
): number {
  switch (metric) {
    case EngagementMetric.IMPRESSIONS:
      return insight.impressions ?? 0;
    case EngagementMetric.REACH:
      return insight.reach ?? 0;
    case EngagementMetric.LIKES:
      return insight.likes ?? 0;
    case EngagementMetric.COMMENTS:
      return insight.comments ?? 0;
    case EngagementMetric.SHARES:
      return insight.shares ?? 0;
    case EngagementMetric.SCORE:
      return computeScore({
        impressions: insight.impressions ?? 0,
        reach: insight.reach ?? 0,
        likes: insight.likes ?? 0,
        comments: insight.comments ?? 0,
        shares: insight.shares ?? 0,
      });
    default:
      return 0;
  }
}

// ── GET /api/engagement-goals/progress ────────────────────────────────────────

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

    const goals = await prisma.engagementGoal.findMany({
      where: { userId: session.user.id, isActive: true },
      orderBy: { createdAt: "asc" },
    });

    const progress = await Promise.all(
      goals.map(async (goal) => {
        const { from, to } = getPeriodWindow(goal.period);

        const platformFilter: { platform?: Platform } = {};
        if (goal.platform) {
          platformFilter.platform = goal.platform;
        }

        const insights = await prisma.postInsights.findMany({
          where: {
            publishResult: {
              post: { userId: session.user.id },
              status: PublishStatus.PUBLISHED,
              publishedAt: { gte: from, lte: to },
              ...platformFilter,
            },
          },
          select: {
            impressions: true,
            reach: true,
            likes: true,
            comments: true,
            shares: true,
          },
        });

        let currentValue = 0;
        if (insights.length > 0) {
          const values = insights.map((ins: InsightValues) =>
            extractMetricValue(ins, goal.metric)
          );
          const total = values.reduce((s: number, v: number) => s + v, 0);
          currentValue =
            goal.aggregation === EngagementAggregation.TOTAL
              ? total
              : total / values.length;
        }

        const percentage = Math.min(
          100,
          Math.round((currentValue / goal.targetValue) * 100)
        );
        const onTrack = currentValue >= goal.targetValue;

        return {
          goalId: goal.id,
          name: goal.name,
          metric: goal.metric,
          aggregation: goal.aggregation,
          period: goal.period,
          platform: goal.platform,
          targetValue: goal.targetValue,
          currentValue: Math.round(currentValue * 100) / 100,
          percentage,
          onTrack,
          sampleSize: insights.length,
        };
      })
    );

    return NextResponse.json({ progress });
  } catch (err) {
    return handleRouteError(err);
  }
}
