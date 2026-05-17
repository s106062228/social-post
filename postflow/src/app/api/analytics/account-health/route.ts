import { type NextRequest, NextResponse } from "next/server";
import { PublishStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AccountHealthMetrics {
  postsPublished30d: number;
  avgEngagementRate: number;
  followerGrowth30d: number | null;
  lastPublishedAt: string | null;
  daysSinceLastPost: number | null;
}

export interface AccountHealthEntry {
  accountId: string;
  accountName: string;
  platform: string;
  isActive: boolean;
  healthScore: number;
  healthLabel: "Healthy" | "Fair" | "Needs Attention";
  metrics: AccountHealthMetrics;
}

export interface AccountHealthResponse {
  accounts: AccountHealthEntry[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeHealthScore(metrics: AccountHealthMetrics): number {
  // Activity (0–50): 5 pts per post published in last 30d, cap 50
  const activityScore = Math.min(metrics.postsPublished30d * 5, 50);

  // Engagement (0–30): 6 pts per 1% engagement rate, cap 30
  const engagementScore = Math.min(metrics.avgEngagementRate * 6, 30);

  // Recency (0–20): 20 if ≤7d, 10 if ≤14d, 5 if ≤30d, 0 otherwise
  let recencyScore = 0;
  if (metrics.daysSinceLastPost !== null) {
    if (metrics.daysSinceLastPost <= 7) recencyScore = 20;
    else if (metrics.daysSinceLastPost <= 14) recencyScore = 10;
    else if (metrics.daysSinceLastPost <= 30) recencyScore = 5;
  }

  return Math.round(activityScore + engagementScore + recencyScore);
}

function healthLabel(score: number): AccountHealthEntry["healthLabel"] {
  if (score >= 70) return "Healthy";
  if (score >= 40) return "Fair";
  return "Needs Attention";
}

// ── GET /api/analytics/account-health ────────────────────────────────────────

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
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Fetch all accounts for the user
    const accounts = await prisma.socialAccount.findMany({
      where: { userId },
      select: {
        id: true,
        accountName: true,
        platform: true,
        isActive: true,
        audienceMetrics: {
          select: { followersCount: true, syncedAt: true },
          orderBy: { syncedAt: "desc" },
          take: 2,
        },
      },
      orderBy: { createdAt: "asc" },
    });

    if (accounts.length === 0) {
      return NextResponse.json({ accounts: [] } satisfies AccountHealthResponse);
    }

    // Fetch published results for all accounts in last 30 days
    const publishResults = await prisma.publishResult.findMany({
      where: {
        accountId: { in: accounts.map((a) => a.id) },
        status: PublishStatus.PUBLISHED,
        publishedAt: { gte: thirtyDaysAgo },
      },
      select: {
        accountId: true,
        publishedAt: true,
        insights: {
          select: {
            impressions: true,
            reach: true,
            likes: true,
            comments: true,
            shares: true,
          },
        },
      },
    });

    // Group publish results by accountId
    const resultsByAccount = new Map<
      string,
      typeof publishResults
    >();
    for (const r of publishResults) {
      if (!resultsByAccount.has(r.accountId)) {
        resultsByAccount.set(r.accountId, []);
      }
      resultsByAccount.get(r.accountId)!.push(r);
    }

    // Build response entries
    const entries: AccountHealthEntry[] = accounts.map((account) => {
      const results = resultsByAccount.get(account.id) ?? [];

      // Posts published in last 30d
      const postsPublished30d = results.length;

      // Average engagement rate
      const insightedResults = results.filter(
        (r) => r.insights && (r.insights.reach ?? 0) > 0
      );
      let avgEngagementRate = 0;
      if (insightedResults.length > 0) {
        const totalEngagementRate = insightedResults.reduce((sum, r) => {
          const ins = r.insights!;
          const engagement = (ins.likes ?? 0) + (ins.comments ?? 0) + (ins.shares ?? 0);
          const reach = ins.reach ?? 1;
          return sum + (engagement / reach) * 100;
        }, 0);
        avgEngagementRate = totalEngagementRate / insightedResults.length;
      }

      // Last published at
      const sortedByDate = results
        .filter((r) => r.publishedAt !== null)
        .sort(
          (a, b) =>
            new Date(b.publishedAt!).getTime() - new Date(a.publishedAt!).getTime()
        );
      const lastPublishedAt =
        sortedByDate.length > 0
          ? sortedByDate[0].publishedAt!.toISOString()
          : null;

      const daysSinceLastPost =
        lastPublishedAt !== null
          ? Math.floor(
              (now.getTime() - new Date(lastPublishedAt).getTime()) /
                (1000 * 60 * 60 * 24)
            )
          : null;

      // Follower growth: latest minus oldest available metric (up to 30d span)
      let followerGrowth30d: number | null = null;
      const metrics = account.audienceMetrics;
      if (metrics.length >= 2) {
        const latest = metrics[0].followersCount ?? null;
        const oldest = metrics[metrics.length - 1].followersCount ?? null;
        if (latest !== null && oldest !== null) {
          followerGrowth30d = latest - oldest;
        }
      }

      const accountMetrics: AccountHealthMetrics = {
        postsPublished30d,
        avgEngagementRate: Math.round(avgEngagementRate * 10) / 10,
        followerGrowth30d,
        lastPublishedAt,
        daysSinceLastPost,
      };

      const score = computeHealthScore(accountMetrics);

      return {
        accountId: account.id,
        accountName: account.accountName,
        platform: account.platform,
        isActive: account.isActive,
        healthScore: score,
        healthLabel: healthLabel(score),
        metrics: accountMetrics,
      };
    });

    return NextResponse.json({ accounts: entries } satisfies AccountHealthResponse);
  } catch (err) {
    return handleRouteError(err);
  }
}
