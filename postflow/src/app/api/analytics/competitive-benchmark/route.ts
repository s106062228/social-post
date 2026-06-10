import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import type { Platform } from "@prisma/client";

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

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [userAccounts, competitors, recentPublishResults] = await Promise.all([
      prisma.socialAccount.findMany({
        where: { userId: session.user.id, isActive: true },
        include: {
          audienceMetrics: {
            orderBy: { syncedAt: "desc" },
            take: 1,
          },
        },
      }),
      prisma.competitorAccount.findMany({
        where: { userId: session.user.id },
        include: {
          snapshots: {
            orderBy: { recordedAt: "desc" },
            take: 1,
          },
        },
      }),
      prisma.publishResult.findMany({
        where: {
          post: { userId: session.user.id },
          status: "PUBLISHED",
          publishedAt: { gte: thirtyDaysAgo },
        },
        include: {
          insights: true,
        },
      }),
    ]);

    // Build per-account stats
    const accountStatsMap = new Map<
      string,
      { engagementRates: number[]; publishCount: number }
    >();

    for (const result of recentPublishResults) {
      const key = `${result.accountId}:${result.platform}`;
      if (!accountStatsMap.has(key)) {
        accountStatsMap.set(key, { engagementRates: [], publishCount: 0 });
      }
      const stats = accountStatsMap.get(key)!;
      stats.publishCount += 1;

      if (result.insights?.reach && result.insights.reach > 0) {
        const engagement =
          (result.insights.likes ?? 0) +
          (result.insights.comments ?? 0) +
          (result.insights.shares ?? 0);
        stats.engagementRates.push((engagement / result.insights.reach) * 100);
      }
    }

    // Group by platform
    const platformMap = new Map<
      Platform,
      {
        platform: Platform;
        userAccounts: {
          accountId: string;
          accountName: string;
          followersCount: number | null;
          avgEngagementRate: number | null;
          postsPerWeek: number | null;
        }[];
        competitors: {
          competitorId: string;
          name: string;
          handle: string;
          profileUrl: string | null;
          followersCount: number | null;
          avgEngagementRate: number | null;
          postsPerWeek: number | null;
        }[];
        bestFollowers: number | null;
        bestEngagement: number | null;
      }
    >();

    // Process user accounts
    for (const account of userAccounts) {
      const latestMetric = account.audienceMetrics[0] ?? null;
      const followersCount = latestMetric?.followersCount ?? null;

      const key = `${account.id}:${account.platform}`;
      const stats = accountStatsMap.get(key);

      const avgEngagementRate =
        stats && stats.engagementRates.length > 0
          ? stats.engagementRates.reduce((a, b) => a + b, 0) / stats.engagementRates.length
          : null;

      const postsPerWeek =
        stats && stats.publishCount > 0 ? (stats.publishCount / 30) * 7 : null;

      if (!platformMap.has(account.platform)) {
        platformMap.set(account.platform, {
          platform: account.platform,
          userAccounts: [],
          competitors: [],
          bestFollowers: null,
          bestEngagement: null,
        });
      }

      platformMap.get(account.platform)!.userAccounts.push({
        accountId: account.id,
        accountName: account.accountName,
        followersCount,
        avgEngagementRate:
          avgEngagementRate !== null ? Math.round(avgEngagementRate * 100) / 100 : null,
        postsPerWeek: postsPerWeek !== null ? Math.round(postsPerWeek * 10) / 10 : null,
      });
    }

    // Process competitor accounts
    for (const competitor of competitors) {
      const latestSnapshot = competitor.snapshots[0] ?? null;

      if (!platformMap.has(competitor.platform)) {
        platformMap.set(competitor.platform, {
          platform: competitor.platform,
          userAccounts: [],
          competitors: [],
          bestFollowers: null,
          bestEngagement: null,
        });
      }

      platformMap.get(competitor.platform)!.competitors.push({
        competitorId: competitor.id,
        name: competitor.name,
        handle: competitor.handle,
        profileUrl: competitor.profileUrl,
        followersCount: latestSnapshot?.followersCount ?? null,
        avgEngagementRate: latestSnapshot?.avgEngagementRate ?? null,
        postsPerWeek: latestSnapshot?.postsPerWeek ?? null,
      });
    }

    // Compute best-in-class per platform
    const platforms = Array.from(platformMap.values()).map((p) => {
      const allFollowers = [
        ...p.userAccounts.map((a) => a.followersCount),
        ...p.competitors.map((c) => c.followersCount),
      ].filter((v): v is number => v !== null);

      const allEngagement = [
        ...p.userAccounts.map((a) => a.avgEngagementRate),
        ...p.competitors.map((c) => c.avgEngagementRate),
      ].filter((v): v is number => v !== null);

      return {
        ...p,
        bestFollowers: allFollowers.length > 0 ? Math.max(...allFollowers) : null,
        bestEngagement: allEngagement.length > 0 ? Math.max(...allEngagement) : null,
      };
    });

    return NextResponse.json({ platforms });
  } catch (err) {
    return handleRouteError(err);
  }
}
