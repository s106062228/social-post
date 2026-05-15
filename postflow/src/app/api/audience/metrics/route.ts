import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AudienceMetricEntry {
  syncedAt: string;
  followersCount: number | null;
  followingCount: number | null;
}

export interface AudienceAccountMetrics {
  accountId: string;
  accountName: string;
  platform: string;
  metrics: AudienceMetricEntry[];
}

export interface AudienceMetricsResponse {
  accounts: AudienceAccountMetrics[];
}

// ── GET /api/audience/metrics ─────────────────────────────────────────────────

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

    // Optional accountId filter
    const url = new URL(request.url);
    const accountIdFilter = url.searchParams.get("accountId");

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    // Fetch active social accounts for this user (optionally filtered)
    const accounts = await prisma.socialAccount.findMany({
      where: {
        userId,
        isActive: true,
        ...(accountIdFilter ? { id: accountIdFilter } : {}),
      },
      select: {
        id: true,
        accountName: true,
        platform: true,
        audienceMetrics: {
          where: {
            syncedAt: { gte: ninetyDaysAgo },
          },
          orderBy: { syncedAt: "asc" },
          select: {
            syncedAt: true,
            followersCount: true,
            followingCount: true,
          },
        },
      },
    });

    const result: AudienceAccountMetrics[] = accounts.map((account) => ({
      accountId: account.id,
      accountName: account.accountName,
      platform: account.platform,
      metrics: account.audienceMetrics.map((m) => ({
        syncedAt: m.syncedAt.toISOString(),
        followersCount: m.followersCount,
        followingCount: m.followingCount,
      })),
    }));

    return NextResponse.json({ accounts: result } satisfies AudienceMetricsResponse);
  } catch (err) {
    return handleRouteError(err);
  }
}
