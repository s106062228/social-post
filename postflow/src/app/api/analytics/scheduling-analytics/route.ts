import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PostStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const PERIOD_DAYS: Record<string, number> = {
  "30d": 30,
  "90d": 90,
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const querySchema = z.object({
  period: z.enum(["30d", "90d"]).default("30d"),
});

export interface DayDistributionEntry {
  dayName: string;
  count: number;
}

export interface HourDistributionEntry {
  hour: number;
  count: number;
}

export interface PlatformBalanceEntry {
  platform: string;
  count: number;
}

export interface SchedulingAnalyticsResponse {
  period: string;
  occupancyRate: number;
  avgPostsPerActiveDay: number;
  dayDistribution: DayDistributionEntry[];
  hourDistribution: HourDistributionEntry[];
  avgLeadTimeDays: number | null;
  platformBalance: PlatformBalanceEntry[];
  totalScheduled: number;
  totalPublished: number;
}

// ── GET /api/analytics/scheduling-analytics ───────────────────────────────────

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
    const userId = session.user.id;
    const daysBack = PERIOD_DAYS[period];
    const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

    // Fetch SCHEDULED and PUBLISHED posts in the period
    const posts = await prisma.post.findMany({
      where: {
        userId,
        status: { in: [PostStatus.SCHEDULED, PostStatus.PUBLISHED] },
        OR: [
          { scheduledAt: { gte: since } },
          { createdAt: { gte: since } },
        ],
      },
      select: {
        status: true,
        scheduledAt: true,
        createdAt: true,
        publishResults: {
          select: { platform: true },
        },
      },
    });

    const totalScheduled = posts.filter((p) => p.status === PostStatus.SCHEDULED).length;
    const totalPublished = posts.filter((p) => p.status === PostStatus.PUBLISHED).length;

    // ── Day distribution (0=Sun … 6=Sat) ────────────────────────────────────
    const dayCountMap: number[] = Array.from({ length: 7 }, () => 0);
    // ── Hour distribution (0-23) ─────────────────────────────────────────────
    const hourCountMap: number[] = Array.from({ length: 24 }, () => 0);

    // ── Occupancy: track distinct calendar days (YYYY-MM-DD UTC) ─────────────
    const activeDaySet = new Set<string>();

    // ── Lead times for SCHEDULED posts ────────────────────────────────────────
    const leadTimesMs: number[] = [];

    for (const post of posts) {
      const ref = post.scheduledAt ?? post.createdAt;
      const dayOfWeek = ref.getUTCDay(); // 0=Sun
      const hour = ref.getUTCHours();

      dayCountMap[dayOfWeek] += 1;
      hourCountMap[hour] += 1;

      // Occupancy: use date string YYYY-MM-DD UTC
      const dateStr = ref.toISOString().slice(0, 10);
      activeDaySet.add(dateStr);

      // Lead time: only for posts that have a scheduledAt distinct from createdAt
      if (post.status === PostStatus.SCHEDULED && post.scheduledAt != null) {
        const leadMs = post.scheduledAt.getTime() - post.createdAt.getTime();
        if (leadMs > 0) {
          leadTimesMs.push(leadMs);
        }
      }
    }

    const dayDistribution: DayDistributionEntry[] = DAY_NAMES.map(
      (dayName, idx) => ({ dayName, count: dayCountMap[idx] })
    );

    const hourDistribution: HourDistributionEntry[] = Array.from(
      { length: 24 },
      (_, hour) => ({ hour, count: hourCountMap[hour] })
    );

    // ── Occupancy rate ────────────────────────────────────────────────────────
    const occupancyRate =
      daysBack > 0
        ? Math.min(100, Math.round((activeDaySet.size / daysBack) * 100))
        : 0;

    // ── Avg posts per active day ──────────────────────────────────────────────
    const avgPostsPerActiveDay =
      activeDaySet.size > 0
        ? Math.round((posts.length / activeDaySet.size) * 10) / 10
        : 0;

    // ── Median lead time (in days) ────────────────────────────────────────────
    let avgLeadTimeDays: number | null = null;
    if (leadTimesMs.length > 0) {
      const sorted = [...leadTimesMs].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const medianMs =
        sorted.length % 2 === 0
          ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
          : (sorted[mid] ?? 0);
      avgLeadTimeDays = Math.round((medianMs / (1000 * 60 * 60 * 24)) * 10) / 10;
    }

    // ── Platform balance from publishResults ──────────────────────────────────
    const platformCountMap = new Map<string, number>();
    for (const post of posts) {
      for (const pr of post.publishResults) {
        platformCountMap.set(
          pr.platform,
          (platformCountMap.get(pr.platform) ?? 0) + 1
        );
      }
    }

    const platformBalance: PlatformBalanceEntry[] = Array.from(
      platformCountMap.entries()
    )
      .map(([platform, count]) => ({ platform, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      period,
      occupancyRate,
      avgPostsPerActiveDay,
      dayDistribution,
      hourDistribution,
      avgLeadTimeDays,
      platformBalance,
      totalScheduled,
      totalPublished,
    } satisfies SchedulingAnalyticsResponse);
  } catch (err) {
    return handleRouteError(err);
  }
}
