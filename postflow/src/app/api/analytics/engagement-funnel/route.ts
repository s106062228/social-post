import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const PERIOD_DAYS: Record<string, number> = { "30d": 30, "90d": 90 };

const querySchema = z.object({
  period: z.enum(["30d", "90d"]).default("30d"),
});

export interface FunnelPlatformData {
  platform: string;
  impressions: number;
  reach: number;
  engagement: number;
  reachRate: number | null;
  engagementRate: number | null;
  engagementFromReachRate: number | null;
  postCount: number;
}

export interface EngagementFunnelResponse {
  period: string;
  overall: {
    impressions: number;
    reach: number;
    engagement: number;
    reachRate: number | null;
    engagementRate: number | null;
    engagementFromReachRate: number | null;
  };
  platforms: FunnelPlatformData[];
  topPlatform: string | null;
}

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

    const raw = { period: request.nextUrl.searchParams.get("period") ?? "30d" };
    const parsed = querySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { period } = parsed.data;
    const days = PERIOD_DAYS[period];
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const results = await prisma.publishResult.findMany({
      where: {
        post: { userId: session.user.id },
        status: "PUBLISHED",
        publishedAt: { gte: since },
      },
      include: {
        insights: true,
      },
    });

    // Aggregate per platform
    const platformMap = new Map<
      string,
      { impressions: number; reach: number; engagement: number; postCount: number }
    >();

    for (const result of results) {
      const platform = result.platform as string;
      if (!platformMap.has(platform)) {
        platformMap.set(platform, { impressions: 0, reach: 0, engagement: 0, postCount: 0 });
      }
      const entry = platformMap.get(platform)!;
      entry.postCount += 1;

      for (const insight of result.insights) {
        entry.impressions += insight.impressions ?? 0;
        entry.reach += insight.reach ?? 0;
        entry.engagement +=
          (insight.likes ?? 0) + (insight.comments ?? 0) + (insight.shares ?? 0);
      }
    }

    const platforms: FunnelPlatformData[] = Array.from(platformMap.entries())
      .map(([platform, data]) => ({
        platform,
        impressions: data.impressions,
        reach: data.reach,
        engagement: data.engagement,
        postCount: data.postCount,
        reachRate:
          data.impressions > 0
            ? Math.round((data.reach / data.impressions) * 10000) / 100
            : null,
        engagementRate:
          data.impressions > 0
            ? Math.round((data.engagement / data.impressions) * 10000) / 100
            : null,
        engagementFromReachRate:
          data.reach > 0
            ? Math.round((data.engagement / data.reach) * 10000) / 100
            : null,
      }))
      .sort((a, b) => b.impressions - a.impressions);

    // Aggregate overall
    let totalImpressions = 0;
    let totalReach = 0;
    let totalEngagement = 0;
    for (const p of platforms) {
      totalImpressions += p.impressions;
      totalReach += p.reach;
      totalEngagement += p.engagement;
    }

    const topPlatform =
      platforms.length > 0
        ? platforms.reduce((best, p) =>
            (p.engagementRate ?? 0) > (best.engagementRate ?? 0) ? p : best
          ).platform
        : null;

    const overall = {
      impressions: totalImpressions,
      reach: totalReach,
      engagement: totalEngagement,
      reachRate:
        totalImpressions > 0
          ? Math.round((totalReach / totalImpressions) * 10000) / 100
          : null,
      engagementRate:
        totalImpressions > 0
          ? Math.round((totalEngagement / totalImpressions) * 10000) / 100
          : null,
      engagementFromReachRate:
        totalReach > 0
          ? Math.round((totalEngagement / totalReach) * 10000) / 100
          : null,
    };

    return NextResponse.json({
      period,
      overall,
      platforms,
      topPlatform,
    } satisfies EngagementFunnelResponse);
  } catch (err) {
    return handleRouteError(err);
  }
}
