import { type NextRequest, NextResponse } from "next/server";
import { PublishStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PortfolioAccountEntry {
  accountId: string;
  accountName: string;
  platform: string;
  isActive: boolean;
  followers: number | null;
  followerGrowth7d: number | null;
  postsPublished30d: number;
  totalEngagement30d: number;
  avgEngagementRate: number;
}

export interface PortfolioResponse {
  totalAccounts: number;
  activeAccounts: number;
  totalFollowers: number;
  totalFollowerGrowth7d: number;
  totalPublished30d: number;
  totalEngagement30d: number;
  overallEngagementRate: number;
  topPlatformByFollowers: string | null;
  topPlatformByEngagement: string | null;
  accounts: PortfolioAccountEntry[];
}

// ── GET /api/analytics/portfolio ──────────────────────────────────────────────

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
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

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
          take: 5,
        },
      },
      orderBy: { createdAt: "asc" },
    });

    if (accounts.length === 0) {
      return NextResponse.json({
        totalAccounts: 0,
        activeAccounts: 0,
        totalFollowers: 0,
        totalFollowerGrowth7d: 0,
        totalPublished30d: 0,
        totalEngagement30d: 0,
        overallEngagementRate: 0,
        topPlatformByFollowers: null,
        topPlatformByEngagement: null,
        accounts: [],
      } satisfies PortfolioResponse);
    }

    const publishResults = await prisma.publishResult.findMany({
      where: {
        accountId: { in: accounts.map((a) => a.id) },
        status: PublishStatus.PUBLISHED,
        publishedAt: { gte: thirtyDaysAgo },
      },
      select: {
        accountId: true,
        insights: {
          select: {
            reach: true,
            likes: true,
            comments: true,
            shares: true,
          },
        },
      },
    });

    const resultsByAccount = new Map<string, typeof publishResults>();
    for (const r of publishResults) {
      if (!resultsByAccount.has(r.accountId)) {
        resultsByAccount.set(r.accountId, []);
      }
      resultsByAccount.get(r.accountId)!.push(r);
    }

    const entries: PortfolioAccountEntry[] = accounts.map((account) => {
      const results = resultsByAccount.get(account.id) ?? [];
      const postsPublished30d = results.length;

      // Latest followers
      const latestMetric = account.audienceMetrics[0];
      const followers = latestMetric?.followersCount ?? null;

      // 7-day follower growth: latest minus metric just before 7d ago
      let followerGrowth7d: number | null = null;
      const metricsInWindow = account.audienceMetrics.filter(
        (m) => new Date(m.syncedAt) >= sevenDaysAgo
      );
      const metricsBeforeWindow = account.audienceMetrics.filter(
        (m) => new Date(m.syncedAt) < sevenDaysAgo
      );
      if (
        followers !== null &&
        (metricsBeforeWindow.length > 0 || metricsInWindow.length > 1)
      ) {
        const baseline =
          metricsBeforeWindow.length > 0
            ? metricsBeforeWindow[0].followersCount
            : metricsInWindow[metricsInWindow.length - 1].followersCount;
        if (baseline !== null) {
          followerGrowth7d = followers - baseline;
        }
      }

      // Engagement metrics
      let totalEngagement30d = 0;
      const insightedResults = results.filter(
        (r) => r.insights && (r.insights.reach ?? 0) > 0
      );
      let totalEngagementRate = 0;
      for (const r of results) {
        if (r.insights) {
          totalEngagement30d +=
            (r.insights.likes ?? 0) +
            (r.insights.comments ?? 0) +
            (r.insights.shares ?? 0);
        }
      }
      if (insightedResults.length > 0) {
        for (const r of insightedResults) {
          const ins = r.insights!;
          const eng =
            (ins.likes ?? 0) + (ins.comments ?? 0) + (ins.shares ?? 0);
          const reach = ins.reach ?? 1;
          totalEngagementRate += (eng / reach) * 100;
        }
      }
      const avgEngagementRate =
        insightedResults.length > 0
          ? Math.round((totalEngagementRate / insightedResults.length) * 10) / 10
          : 0;

      return {
        accountId: account.id,
        accountName: account.accountName,
        platform: account.platform,
        isActive: account.isActive,
        followers,
        followerGrowth7d,
        postsPublished30d,
        totalEngagement30d,
        avgEngagementRate,
      };
    });

    // Aggregate totals
    const totalAccounts = entries.length;
    const activeAccounts = entries.filter((e) => e.isActive).length;
    const totalFollowers = entries.reduce(
      (sum, e) => sum + (e.followers ?? 0),
      0
    );
    const totalFollowerGrowth7d = entries.reduce(
      (sum, e) => sum + (e.followerGrowth7d ?? 0),
      0
    );
    const totalPublished30d = entries.reduce(
      (sum, e) => sum + e.postsPublished30d,
      0
    );
    const totalEngagement30d = entries.reduce(
      (sum, e) => sum + e.totalEngagement30d,
      0
    );

    // Overall engagement rate: weighted average by posts published
    const engagingEntries = entries.filter((e) => e.postsPublished30d > 0);
    let overallEngagementRate = 0;
    if (engagingEntries.length > 0) {
      const totalWeightedRate = engagingEntries.reduce(
        (sum, e) => sum + e.avgEngagementRate * e.postsPublished30d,
        0
      );
      const totalWeight = engagingEntries.reduce(
        (sum, e) => sum + e.postsPublished30d,
        0
      );
      overallEngagementRate =
        totalWeight > 0
          ? Math.round((totalWeightedRate / totalWeight) * 10) / 10
          : 0;
    }

    // Top platform by followers
    const byFollowers = [...entries]
      .filter((e) => e.followers !== null && e.followers > 0)
      .sort((a, b) => (b.followers ?? 0) - (a.followers ?? 0));
    const topPlatformByFollowers = byFollowers[0]?.platform ?? null;

    // Top platform by engagement
    const byEngagement = [...entries]
      .filter((e) => e.totalEngagement30d > 0)
      .sort((a, b) => b.totalEngagement30d - a.totalEngagement30d);
    const topPlatformByEngagement = byEngagement[0]?.platform ?? null;

    return NextResponse.json({
      totalAccounts,
      activeAccounts,
      totalFollowers,
      totalFollowerGrowth7d,
      totalPublished30d,
      totalEngagement30d,
      overallEngagementRate,
      topPlatformByFollowers,
      topPlatformByEngagement,
      accounts: entries,
    } satisfies PortfolioResponse);
  } catch (err) {
    return handleRouteError(err);
  }
}
