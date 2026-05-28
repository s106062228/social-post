import { type NextRequest, NextResponse } from "next/server";
import { PublishStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AccountComparisonMetrics {
  publishedCount30d: number;
  avgEngagement: number;
  engagementRate: number;
  followerGrowth30d: number | null;
  postsPerWeek: number;
  topPostId: string | null;
}

export interface AccountComparisonData {
  accountId: string;
  accountName: string;
  platform: string;
  metrics: AccountComparisonMetrics;
}

export interface AccountComparisonResponse {
  accounts: AccountComparisonData[];
  comparedAt: string;
}

// ── GET /api/analytics/account-comparison ─────────────────────────────────────

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

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const accountIds = searchParams.getAll("accountIds[]");

    if (accountIds.length < 2) {
      return NextResponse.json(
        { error: "At least 2 accountIds[] are required" },
        { status: 400 }
      );
    }
    if (accountIds.length > 4) {
      return NextResponse.json(
        { error: "Maximum 4 accountIds[] allowed" },
        { status: 400 }
      );
    }

    // Verify ownership — only return accounts belonging to the current user
    const accounts = await prisma.socialAccount.findMany({
      where: { id: { in: accountIds }, userId },
      select: {
        id: true,
        accountName: true,
        platform: true,
        audienceMetrics: {
          select: { followersCount: true, syncedAt: true },
          orderBy: { syncedAt: "desc" },
          take: 2,
        },
      },
    });

    if (accounts.length < 2) {
      return NextResponse.json(
        { error: "Not enough valid accounts found. Ensure all accountIds belong to you." },
        { status: 400 }
      );
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Fetch published results with insights for these accounts in last 30 days
    const publishResults = await prisma.publishResult.findMany({
      where: {
        accountId: { in: accounts.map((a) => a.id) },
        status: PublishStatus.PUBLISHED,
        publishedAt: { gte: thirtyDaysAgo },
      },
      select: {
        accountId: true,
        postId: true,
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

    // Group by accountId
    const resultsByAccount = new Map<string, typeof publishResults>();
    for (const r of publishResults) {
      if (!resultsByAccount.has(r.accountId)) {
        resultsByAccount.set(r.accountId, []);
      }
      resultsByAccount.get(r.accountId)!.push(r);
    }

    const comparisonData: AccountComparisonData[] = accounts.map((account) => {
      const results = resultsByAccount.get(account.id) ?? [];

      const publishedCount30d = results.length;
      // Posts per week = count / 4.29 (30 days ÷ 7)
      const postsPerWeek = Math.round((publishedCount30d / 4.29) * 10) / 10;

      // Compute per-post engagement and find top post
      let totalEngagement = 0;
      let totalReach = 0;
      let topPostId: string | null = null;
      let topPostEngagement = -1;

      const postEngagements = new Map<string, number>();

      for (const r of results) {
        if (!r.insights) continue;
        const ins = r.insights;
        const engagement = (ins.likes ?? 0) + (ins.comments ?? 0) + (ins.shares ?? 0);
        totalEngagement += engagement;
        totalReach += ins.reach ?? 0;

        const prev = postEngagements.get(r.postId) ?? 0;
        postEngagements.set(r.postId, prev + engagement);
      }

      // Find top post
      for (const [postId, eng] of postEngagements) {
        if (eng > topPostEngagement) {
          topPostEngagement = eng;
          topPostId = postId;
        }
      }

      const insightedCount = results.filter((r) => r.insights !== null).length;
      const avgEngagement = insightedCount > 0
        ? Math.round((totalEngagement / insightedCount) * 10) / 10
        : 0;

      const engagementRate = totalReach > 0
        ? Math.round((totalEngagement / totalReach) * 1000) / 10
        : 0;

      // Follower growth: latest minus oldest available audience metric
      let followerGrowth30d: number | null = null;
      const metrics = account.audienceMetrics;
      if (metrics.length >= 2) {
        const latest = metrics[0].followersCount ?? null;
        const oldest = metrics[metrics.length - 1].followersCount ?? null;
        if (latest !== null && oldest !== null) {
          followerGrowth30d = latest - oldest;
        }
      }

      return {
        accountId: account.id,
        accountName: account.accountName,
        platform: account.platform,
        metrics: {
          publishedCount30d,
          avgEngagement,
          engagementRate,
          followerGrowth30d,
          postsPerWeek,
          topPostId,
        },
      };
    });

    return NextResponse.json({
      accounts: comparisonData,
      comparedAt: now.toISOString(),
    } satisfies AccountComparisonResponse);
  } catch (err) {
    return handleRouteError(err);
  }
}
