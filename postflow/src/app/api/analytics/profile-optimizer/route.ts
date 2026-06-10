import { type NextRequest, NextResponse } from "next/server";
import { PublishStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import {
  computeProfileScore,
  type ProfileScore,
} from "@/lib/profile-optimizer";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProfileOptimizationData {
  accountId: string;
  accountName: string;
  platform: string;
  isActive: boolean;
  score: ProfileScore;
}

export interface ProfileOptimizerResponse {
  accounts: ProfileOptimizationData[];
  fleetScore: number | null;
}

// ── GET /api/analytics/profile-optimizer ─────────────────────────────────────

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

    const userId = session.user.id;
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const accounts = await prisma.socialAccount.findMany({
      where: { userId, isActive: true },
      select: {
        id: true,
        accountName: true,
        platform: true,
        isActive: true,
        audienceMetrics: {
          where: { syncedAt: { gte: ninetyDaysAgo } },
          select: { followersCount: true, syncedAt: true },
          orderBy: { syncedAt: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    if (accounts.length === 0) {
      return NextResponse.json({
        accounts: [],
        fleetScore: null,
      } satisfies ProfileOptimizerResponse);
    }

    // Batch-fetch publish results for all accounts
    const publishResults = await prisma.publishResult.findMany({
      where: {
        accountId: { in: accounts.map((a) => a.id) },
        status: PublishStatus.PUBLISHED,
        publishedAt: { gte: ninetyDaysAgo },
      },
      select: {
        accountId: true,
        publishedAt: true,
        insights: {
          select: { likes: true, comments: true, shares: true, reach: true },
        },
      },
      orderBy: { publishedAt: "asc" },
    });

    // Group by accountId
    const resultsByAccount = new Map<string, typeof publishResults>();
    for (const r of publishResults) {
      if (!resultsByAccount.has(r.accountId)) {
        resultsByAccount.set(r.accountId, []);
      }
      resultsByAccount.get(r.accountId)!.push(r);
    }

    // Build per-account optimization data
    const result: ProfileOptimizationData[] = accounts.map((account) => {
      const results = resultsByAccount.get(account.id) ?? [];

      const postsLast90d = results.length;

      const publishedTimestamps = results
        .filter((r) => r.publishedAt !== null)
        .map((r) => r.publishedAt!.getTime())
        .sort((a, b) => a - b);

      const insightedResults = results.filter(
        (r) => r.insights && (r.insights.reach ?? 0) > 0
      );
      let avgEngagementRate = 0;
      if (insightedResults.length > 0) {
        const total = insightedResults.reduce((sum, r) => {
          const ins = r.insights!;
          const eng =
            (ins.likes ?? 0) + (ins.comments ?? 0) + (ins.shares ?? 0);
          return sum + (eng / (ins.reach ?? 1)) * 100;
        }, 0);
        avgEngagementRate = total / insightedResults.length;
      }

      const followerCounts = account.audienceMetrics.map((m) => ({
        syncedAt: m.syncedAt.getTime(),
        followersCount: m.followersCount,
      }));

      const score = computeProfileScore({
        platform: account.platform,
        postsLast90d,
        publishedTimestamps,
        avgEngagementRate,
        followerCounts,
      });

      return {
        accountId: account.id,
        accountName: account.accountName,
        platform: account.platform,
        isActive: account.isActive,
        score,
      };
    });

    // Fleet-wide average
    const fleetScore =
      result.length > 0
        ? Math.round(
            result.reduce((s, a) => s + a.score.overallScore, 0) / result.length
          )
        : null;

    return NextResponse.json({
      accounts: result,
      fleetScore,
    } satisfies ProfileOptimizerResponse);
  } catch (err) {
    return handleRouteError(err);
  }
}
