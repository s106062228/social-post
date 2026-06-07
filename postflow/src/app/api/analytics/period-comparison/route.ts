import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const querySchema = z.object({
  period: z.enum(["7d", "30d", "90d"]).default("30d"),
});

interface PeriodMetrics {
  posts: number;
  engagement: number;
  reach: number;
  impressions: number;
  avgEngagementRate: number;
  platformBreakdown: { platform: string; posts: number; engagement: number }[];
}

export interface PeriodComparisonResponse {
  period: string;
  current: PeriodMetrics;
  previous: PeriodMetrics;
  deltas: {
    posts: number | null;
    engagement: number | null;
    reach: number | null;
    impressions: number | null;
    avgEngagementRate: number | null;
  };
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100 * 10) / 10;
}

async function computeMetrics(
  userId: string,
  from: Date,
  to: Date
): Promise<PeriodMetrics> {
  const posts = await prisma.post.findMany({
    where: {
      userId,
      status: "PUBLISHED",
      updatedAt: { gte: from, lt: to },
    },
    select: {
      id: true,
      publishResults: {
        where: { status: "PUBLISHED" },
        select: {
          platform: true,
          insights: {
            select: {
              likes: true,
              comments: true,
              shares: true,
              reach: true,
              impressions: true,
            },
          },
        },
      },
    },
  });

  let totalEngagement = 0;
  let totalReach = 0;
  let totalImpressions = 0;
  let insightCount = 0;
  const platformMap = new Map<string, { posts: number; engagement: number }>();

  for (const post of posts) {
    for (const pr of post.publishResults) {
      const ins = pr.insights;
      if (!ins) continue;
      const eng = (ins.likes ?? 0) + (ins.comments ?? 0) + (ins.shares ?? 0);
      totalEngagement += eng;
      totalReach += ins.reach ?? 0;
      totalImpressions += ins.impressions ?? 0;
      insightCount++;

      const existing = platformMap.get(pr.platform) ?? { posts: 0, engagement: 0 };
      platformMap.set(pr.platform, {
        posts: existing.posts + 1,
        engagement: existing.engagement + eng,
      });
    }
  }

  const avgEngagementRate =
    totalReach > 0 && insightCount > 0
      ? Math.round((totalEngagement / totalReach) * 100 * 100) / 100
      : 0;

  const platformBreakdown = Array.from(platformMap.entries())
    .map(([platform, data]) => ({ platform, ...data }))
    .sort((a, b) => b.posts - a.posts);

  return {
    posts: posts.length,
    engagement: totalEngagement,
    reach: totalReach,
    impressions: totalImpressions,
    avgEngagementRate,
    platformBreakdown,
  };
}

// ── GET /api/analytics/period-comparison ─────────────────────────────────────

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
      return NextResponse.json(
        { error: "Invalid query parameters", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { period } = parsed.data;
    const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;

    const now = new Date();
    const currentFrom = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const previousFrom = new Date(currentFrom.getTime() - days * 24 * 60 * 60 * 1000);

    const [current, previous] = await Promise.all([
      computeMetrics(session.user.id, currentFrom, now),
      computeMetrics(session.user.id, previousFrom, currentFrom),
    ]);

    const deltas = {
      posts: pctChange(current.posts, previous.posts),
      engagement: pctChange(current.engagement, previous.engagement),
      reach: pctChange(current.reach, previous.reach),
      impressions: pctChange(current.impressions, previous.impressions),
      avgEngagementRate: pctChange(current.avgEngagementRate, previous.avgEngagementRate),
    };

    return NextResponse.json({
      period,
      current,
      previous,
      deltas,
    } satisfies PeriodComparisonResponse);
  } catch (err) {
    return handleRouteError(err);
  }
}
