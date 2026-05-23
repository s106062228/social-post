import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PostStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const querySchema = z.object({
  year: z
    .string()
    .regex(/^\d{4}$/, "year must be a 4-digit number")
    .transform(Number)
    .refine((y) => y >= 2020 && y <= 2100, "year out of range")
    .optional(),
  month: z
    .string()
    .regex(/^\d{1,2}$/, "month must be a number")
    .transform(Number)
    .refine((m) => m >= 1 && m <= 12, "month must be between 1 and 12")
    .optional(),
});

export interface MonthlySummaryByPlatform {
  platform: string;
  count: number;
}

export interface MonthlySummaryWeekday {
  dayName: string;
  count: number;
}

export interface MonthlySummaryBusiestDay {
  date: string;
  count: number;
}

export interface MonthlySummaryResponse {
  year: number;
  month: number;
  totalPosts: number;
  byStatus: Record<string, number>;
  byPlatform: MonthlySummaryByPlatform[];
  avgPostsPerDay: number;
  busiestDay: MonthlySummaryBusiestDay | null;
  quietDays: number;
  weekdayDistribution: MonthlySummaryWeekday[];
}

// ── GET /api/analytics/monthly-summary ───────────────────────────────────────

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

    const now = new Date();
    const rawYear = request.nextUrl.searchParams.get("year") ?? undefined;
    const rawMonth = request.nextUrl.searchParams.get("month") ?? undefined;

    const parsed = querySchema.safeParse({
      year: rawYear,
      month: rawMonth,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const year = parsed.data.year ?? now.getUTCFullYear();
    const month = parsed.data.month ?? now.getUTCMonth() + 1; // 1-based
    const userId = session.user.id;

    // Build UTC month window
    const monthStart = new Date(
      `${year}-${String(month).padStart(2, "0")}-01T00:00:00.000Z`
    );
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const monthEnd = new Date(
      `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00.000Z`
    );

    // Days in this month
    const daysInMonth = Math.round(
      (monthEnd.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Fetch posts for the month
    const posts = await prisma.post.findMany({
      where: {
        userId,
        OR: [
          {
            status: PostStatus.PUBLISHED,
            updatedAt: { gte: monthStart, lt: monthEnd },
          },
          {
            status: PostStatus.SCHEDULED,
            scheduledAt: { gte: monthStart, lt: monthEnd },
          },
        ],
      },
      select: {
        status: true,
        updatedAt: true,
        scheduledAt: true,
      },
    });

    // Fetch publish results for platform breakdown
    const publishResults = await prisma.publishResult.findMany({
      where: {
        post: { userId },
        publishedAt: { gte: monthStart, lt: monthEnd },
      },
      select: {
        platform: true,
      },
    });

    // byStatus
    const byStatus: Record<string, number> = {};
    for (const post of posts) {
      const s = String(post.status);
      byStatus[s] = (byStatus[s] ?? 0) + 1;
    }

    // Count by date and weekday
    const countByDate = new Map<string, number>();
    const weekdayCount = new Array<number>(7).fill(0);

    for (const post of posts) {
      const d =
        post.status === PostStatus.PUBLISHED
          ? post.updatedAt
          : (post.scheduledAt ?? post.updatedAt);
      const key = d.toISOString().slice(0, 10);
      countByDate.set(key, (countByDate.get(key) ?? 0) + 1);

      // weekday from the date key (UTC)
      const dow = d.getUTCDay(); // 0=Sun, 6=Sat
      weekdayCount[dow]++;
    }

    // busiestDay
    let busiestDay: MonthlySummaryBusiestDay | null = null;
    let busiestCount = 0;
    for (const [date, count] of countByDate.entries()) {
      if (count > busiestCount) {
        busiestCount = count;
        busiestDay = { date, count };
      }
    }

    // quietDays: days in the month with 0 posts
    const quietDays = daysInMonth - countByDate.size;

    // avgPostsPerDay
    const totalPosts = posts.length;
    const avgPostsPerDay =
      totalPosts === 0
        ? 0
        : Math.round((totalPosts / daysInMonth) * 10) / 10;

    // byPlatform from publish results
    const platformCount = new Map<string, number>();
    for (const result of publishResults) {
      const p = String(result.platform);
      platformCount.set(p, (platformCount.get(p) ?? 0) + 1);
    }
    const byPlatform: MonthlySummaryByPlatform[] = Array.from(
      platformCount.entries()
    )
      .map(([platform, count]) => ({ platform, count }))
      .sort((a, b) => b.count - a.count);

    // weekdayDistribution
    const weekdayDistribution: MonthlySummaryWeekday[] = DAY_NAMES.map(
      (dayName, i) => ({
        dayName,
        count: weekdayCount[i],
      })
    );

    return NextResponse.json({
      year,
      month,
      totalPosts,
      byStatus,
      byPlatform,
      avgPostsPerDay,
      busiestDay,
      quietDays,
      weekdayDistribution,
    } satisfies MonthlySummaryResponse);
  } catch (err) {
    return handleRouteError(err);
  }
}
