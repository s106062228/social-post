import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import {
  projectGrowth,
  computeGrowthRate,
  getNextMilestone,
} from "@/lib/follower-milestones";

const PROJECTION_DAYS = [30, 60, 90];

// ── GET /api/analytics/growth-projection ─────────────────────────────────────

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

    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const accounts = await prisma.socialAccount.findMany({
      where: { userId: session.user.id, isActive: true },
      select: {
        id: true,
        accountName: true,
        platform: true,
        audienceMetrics: {
          where: { syncedAt: { gte: cutoff } },
          orderBy: { syncedAt: "asc" },
          select: { followersCount: true, syncedAt: true },
        },
      },
    });

    const result = accounts.map((account) => {
      const validMetrics = account.audienceMetrics
        .filter((m): m is { followersCount: number; syncedAt: Date } =>
          m.followersCount !== null
        )
        .map((m) => ({ followersCount: m.followersCount, syncedAt: m.syncedAt }));

      const currentFollowers =
        validMetrics.length > 0
          ? validMetrics[validMetrics.length - 1].followersCount
          : 0;

      const growthRatePerDay = computeGrowthRate(validMetrics);
      const projections = projectGrowth(validMetrics, PROJECTION_DAYS);
      const nextMilestone = getNextMilestone(currentFollowers);

      let daysToNextMilestone: number | null = null;
      if (nextMilestone !== null && growthRatePerDay > 0) {
        const remaining = nextMilestone - currentFollowers;
        daysToNextMilestone = Math.ceil(remaining / growthRatePerDay);
      }

      return {
        accountId: account.id,
        accountName: account.accountName,
        platform: account.platform,
        currentFollowers,
        growthRatePerDay: Math.round(growthRatePerDay * 100) / 100,
        projections,
        nextMilestone,
        daysToNextMilestone,
      };
    });

    return NextResponse.json({ accounts: result });
  } catch (err) {
    return handleRouteError(err);
  }
}
