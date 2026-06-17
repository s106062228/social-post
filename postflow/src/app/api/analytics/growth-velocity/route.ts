import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const PERIOD_DAYS: Record<string, number> = {
  "30d": 30,
  "90d": 90,
  "180d": 180,
};

const querySchema = z.object({
  period: z.enum(["30d", "90d", "180d"]).default("30d"),
});

export interface AccountVelocityData {
  accountId: string;
  accountName: string;
  platform: string;
  currentFollowers: number | null;
  followerGainTotal: number | null;
  followerVelocityPerDay: number | null;
  followerAcceleration: number | null; // velocity change: positive=accelerating, negative=decelerating
  engagementVelocityPerPost: number | null;
  momentumScore: number; // 0-100
  momentumLabel: "Rising" | "Stable" | "Declining" | "Insufficient Data";
  dailyFollowers: { date: string; followersCount: number }[];
}

export interface GrowthVelocityResponse {
  period: string;
  periodDays: number;
  accounts: AccountVelocityData[];
  fleetMomentumScore: number;
  topMomentumAccount: string | null;
}

function computeMomentumScore(
  followerAcceleration: number | null,
  engagementVelocity: number | null,
  followerVelocity: number | null
): number {
  if (followerVelocity === null) return 0;

  // Base score from raw velocity (normalized to 0-50)
  const velocityScore = Math.min(50, Math.max(0, (followerVelocity / 10) * 50));

  // Acceleration bonus/penalty (-25 to +25)
  let accelScore = 25; // neutral
  if (followerAcceleration !== null) {
    const accelFactor = Math.max(-1, Math.min(1, followerAcceleration / 5));
    accelScore = 25 + accelFactor * 25;
  }

  // Engagement velocity contribution (0-25)
  let engScore = 12.5; // neutral
  if (engagementVelocity !== null) {
    engScore = Math.min(25, Math.max(0, (engagementVelocity / 100) * 25));
  }

  return Math.round(Math.min(100, Math.max(0, velocityScore + accelScore + engScore)));
}

function momentumLabel(
  score: number,
  hasSufficientData: boolean
): AccountVelocityData["momentumLabel"] {
  if (!hasSufficientData) return "Insufficient Data";
  if (score >= 60) return "Rising";
  if (score >= 35) return "Stable";
  return "Declining";
}

// ── GET /api/analytics/growth-velocity ────────────────────────────────────────

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
    const periodDays = PERIOD_DAYS[period];
    const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
    // Fetch double the period for acceleration comparison
    const halfPoint = new Date(Date.now() - (periodDays / 2) * 24 * 60 * 60 * 1000);

    const accounts = await prisma.socialAccount.findMany({
      where: { userId: session.user.id, isActive: true },
      select: {
        id: true,
        accountName: true,
        platform: true,
        audienceMetrics: {
          where: { syncedAt: { gte: since } },
          orderBy: { syncedAt: "asc" },
          select: { followersCount: true, syncedAt: true },
        },
        publishResults: {
          where: {
            status: "PUBLISHED",
            publishedAt: { gte: since },
          },
          select: {
            publishedAt: true,
            insights: {
              select: { likes: true, comments: true, shares: true, reach: true },
            },
          },
        },
      },
    });

    let topMomentumAccount: string | null = null;
    let topMomentumScore = -1;
    let totalMomentumSum = 0;
    let accountCount = 0;

    const accountData: AccountVelocityData[] = accounts.map((account) => {
      const metrics = account.audienceMetrics.filter(
        (m): m is { followersCount: number; syncedAt: Date } => m.followersCount !== null
      );

      // Build daily follower series
      const dailyFollowers = metrics.map((m) => ({
        date: m.syncedAt.toISOString().slice(0, 10),
        followersCount: m.followersCount,
      }));

      let currentFollowers: number | null = null;
      let followerGainTotal: number | null = null;
      let followerVelocityPerDay: number | null = null;
      let followerAcceleration: number | null = null;

      if (metrics.length >= 2) {
        const first = metrics[0];
        const last = metrics[metrics.length - 1];
        currentFollowers = last.followersCount;
        followerGainTotal = last.followersCount - first.followersCount;

        const elapsedDays =
          (last.syncedAt.getTime() - first.syncedAt.getTime()) / (1000 * 60 * 60 * 24);
        followerVelocityPerDay =
          elapsedDays > 0
            ? Math.round((followerGainTotal / elapsedDays) * 100) / 100
            : 0;

        // Compute acceleration: compare first-half velocity vs second-half velocity
        const firstHalfMetrics = metrics.filter((m) => m.syncedAt < halfPoint);
        const secondHalfMetrics = metrics.filter((m) => m.syncedAt >= halfPoint);

        if (firstHalfMetrics.length >= 2 && secondHalfMetrics.length >= 2) {
          const fhFirst = firstHalfMetrics[0];
          const fhLast = firstHalfMetrics[firstHalfMetrics.length - 1];
          const shFirst = secondHalfMetrics[0];
          const shLast = secondHalfMetrics[secondHalfMetrics.length - 1];

          const fhDays =
            (fhLast.syncedAt.getTime() - fhFirst.syncedAt.getTime()) / (1000 * 60 * 60 * 24);
          const shDays =
            (shLast.syncedAt.getTime() - shFirst.syncedAt.getTime()) / (1000 * 60 * 60 * 24);

          const fhVelocity =
            fhDays > 0 ? (fhLast.followersCount - fhFirst.followersCount) / fhDays : 0;
          const shVelocity =
            shDays > 0 ? (shLast.followersCount - shFirst.followersCount) / shDays : 0;

          followerAcceleration = Math.round((shVelocity - fhVelocity) * 100) / 100;
        }
      } else if (metrics.length === 1) {
        currentFollowers = metrics[0].followersCount;
      }

      // Engagement velocity: avg total engagement per published post
      let engagementVelocityPerPost: number | null = null;
      const postsWithInsights = account.publishResults.filter((pr) => pr.insights.length > 0);
      if (postsWithInsights.length > 0) {
        const totalEngagement = postsWithInsights.reduce((sum, pr) => {
          const ins = pr.insights[0];
          return sum + (ins.likes ?? 0) + (ins.comments ?? 0) + (ins.shares ?? 0);
        }, 0);
        engagementVelocityPerPost =
          Math.round((totalEngagement / postsWithInsights.length) * 10) / 10;
      }

      const hasSufficientData = metrics.length >= 2;
      const score = computeMomentumScore(
        followerAcceleration,
        engagementVelocityPerPost,
        followerVelocityPerDay
      );
      const label = momentumLabel(score, hasSufficientData);

      if (hasSufficientData) {
        totalMomentumSum += score;
        accountCount++;
        if (score > topMomentumScore) {
          topMomentumScore = score;
          topMomentumAccount = account.accountName;
        }
      }

      return {
        accountId: account.id,
        accountName: account.accountName,
        platform: account.platform,
        currentFollowers,
        followerGainTotal,
        followerVelocityPerDay,
        followerAcceleration,
        engagementVelocityPerPost,
        momentumScore: score,
        momentumLabel: label,
        dailyFollowers,
      };
    });

    const fleetMomentumScore =
      accountCount > 0 ? Math.round(totalMomentumSum / accountCount) : 0;

    const body: GrowthVelocityResponse = {
      period,
      periodDays,
      accounts: accountData,
      fleetMomentumScore,
      topMomentumAccount,
    };

    return NextResponse.json(body);
  } catch (err) {
    return handleRouteError(err);
  }
}
