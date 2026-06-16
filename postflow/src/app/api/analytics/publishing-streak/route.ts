import { type NextRequest, NextResponse } from "next/server";
import { PublishStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

export interface DayCount {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface PublishingStreakResponse {
  currentStreak: number;
  longestStreak: number;
  streakStartDate: string | null;
  totalActiveDays: number;
  last30Days: DayCount[];
  streakLabel: string;
}

/** Convert a Date to a YYYY-MM-DD string in UTC. */
function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Compute the publishing streak stats from a set of active day strings (YYYY-MM-DD, UTC). */
function computeStreakStats(activeDays: Set<string>): {
  currentStreak: number;
  longestStreak: number;
  streakStartDate: string | null;
} {
  if (activeDays.size === 0) {
    return { currentStreak: 0, longestStreak: 0, streakStartDate: null };
  }

  const today = toDateStr(new Date());
  const yesterday = toDateStr(new Date(Date.now() - 86400000));

  // Sort all active dates descending
  const sortedDates = Array.from(activeDays).sort().reverse();

  // --- Current streak ---
  // Walk back from today or yesterday
  let currentStreak = 0;
  let streakStartDate: string | null = null;

  // Determine the anchor: today if published today, else yesterday if published yesterday
  let anchor: string | null = null;
  if (activeDays.has(today)) {
    anchor = today;
  } else if (activeDays.has(yesterday)) {
    anchor = yesterday;
  }

  if (anchor !== null) {
    currentStreak = 1;
    streakStartDate = anchor;
    let cursor = new Date(`${anchor}T00:00:00Z`);
    for (;;) {
      cursor = new Date(cursor.getTime() - 86400000);
      const ds = toDateStr(cursor);
      if (activeDays.has(ds)) {
        currentStreak++;
        streakStartDate = ds;
      } else {
        break;
      }
    }
  }

  // --- Longest streak ---
  // Walk all dates in ascending order
  const ascending = [...sortedDates].reverse();
  let longestStreak = 0;
  let run = 0;
  let prevDate: string | null = null;

  for (const ds of ascending) {
    if (prevDate === null) {
      run = 1;
    } else {
      const prev = new Date(`${prevDate}T00:00:00Z`);
      const curr = new Date(`${ds}T00:00:00Z`);
      const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86400000);
      if (diffDays === 1) {
        run++;
      } else {
        run = 1;
      }
    }
    if (run > longestStreak) longestStreak = run;
    prevDate = ds;
  }

  return { currentStreak, longestStreak, streakStartDate };
}

// ── GET /api/analytics/publishing-streak ─────────────────────────────────────

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

    // Fetch all published results with a publishedAt timestamp
    const results = await prisma.publishResult.findMany({
      where: {
        post: { userId },
        status: PublishStatus.PUBLISHED,
        publishedAt: { not: null },
      },
      select: { publishedAt: true },
    });

    // Build a set of unique active dates (YYYY-MM-DD, UTC)
    const activeDays = new Set<string>();
    const dateCounts = new Map<string, number>();

    for (const r of results) {
      if (r.publishedAt) {
        const ds = toDateStr(r.publishedAt);
        activeDays.add(ds);
        dateCounts.set(ds, (dateCounts.get(ds) ?? 0) + 1);
      }
    }

    const { currentStreak, longestStreak, streakStartDate } =
      computeStreakStats(activeDays);

    const totalActiveDays = activeDays.size;

    // Build last30Days array: 30 entries newest first
    const last30Days: DayCount[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(Date.now() - i * 86400000);
      const ds = toDateStr(d);
      last30Days.push({ date: ds, count: dateCounts.get(ds) ?? 0 });
    }

    const streakLabel =
      currentStreak > 0
        ? `🔥 ${currentStreak}-day streak`
        : "No current streak";

    const response: PublishingStreakResponse = {
      currentStreak,
      longestStreak,
      streakStartDate,
      totalActiveDays,
      last30Days,
      streakLabel,
    };

    return NextResponse.json(response);
  } catch (err) {
    return handleRouteError(err);
  }
}
