import { prisma } from "@/lib/db";
import { Platform, PostStatus, PublishStatus } from "@prisma/client";
import { isInBlackout } from "@/lib/blackout";

export interface ScheduleSuggestion {
  datetime: string; // ISO 8601
  dayLabel: string; // e.g. "Monday"
  timeLabel: string; // e.g. "2:00 PM"
  reason: string;
  score: number;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function toLocalHour(date: Date, timezone: string): { hour: number; dayOfWeek: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      weekday: "short",
      hour12: false,
    }).formatToParts(date);
    const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
    const weekdayStr = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayOfWeek = dayNames.indexOf(weekdayStr);
    return { hour: parseInt(hourStr, 10) % 24, dayOfWeek: dayOfWeek >= 0 ? dayOfWeek : 0 };
  } catch {
    return { hour: date.getUTCHours(), dayOfWeek: date.getUTCDay() };
  }
}

function nextOccurrenceOfSlot(
  hour: number,
  dayOfWeek: number,
  timezone: string,
  after: Date,
  within: number // days
): Date | null {
  for (let d = 0; d < within; d++) {
    const candidate = new Date(after.getTime() + d * 86_400_000);
    const local = toLocalHour(candidate, timezone);
    if (local.dayOfWeek !== dayOfWeek) continue;

    // Reconstruct candidate datetime at `hour` in timezone
    try {
      const dateStr = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(candidate);

      const h = String(hour).padStart(2, "0");
      // Build a naive "local" time string and get its UTC equivalent
      const naiveUtc = new Date(`${dateStr}T${h}:00:00.000Z`);
      // Get offset for this timezone at that moment
      const offsetParts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        timeZoneName: "shortOffset",
      }).formatToParts(naiveUtc);
      const offsetStr = offsetParts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
      const match = offsetStr.match(/GMT([+-])(\d+)(?::(\d+))?/);
      let offsetMins = 0;
      if (match) {
        const sign = match[1] === "+" ? 1 : -1;
        offsetMins = sign * (parseInt(match[2], 10) * 60 + parseInt(match[3] ?? "0", 10));
      }
      const result = new Date(naiveUtc.getTime() - offsetMins * 60_000);
      if (result > after) return result;
    } catch {
      // fall through
    }
  }
  return null;
}

function formatTimeLabel(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const h = hour % 12 || 12;
  return `${h}:00 ${period}`;
}

/**
 * Returns up to `limit` optimal schedule suggestions for `userId`.
 * Suggestions are derived from historical engagement data (best times) and
 * filtered to exclude already-occupied slots and blackout periods.
 */
export async function getSmartScheduleSuggestions(
  userId: string,
  platforms: Platform[] = [],
  timezone: string = "UTC",
  limit: number = 3
): Promise<ScheduleSuggestion[]> {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const now = new Date();
  const horizon = new Date(now.getTime() + 14 * 86_400_000);

  // Query publish results with insights
  const publishResults = await prisma.publishResult.findMany({
    where: {
      post: { userId },
      status: PublishStatus.PUBLISHED,
      publishedAt: { gte: ninetyDaysAgo, not: null },
      insights: { isNot: null },
      ...(platforms.length > 0 ? { platform: { in: platforms } } : {}),
    },
    select: {
      platform: true,
      publishedAt: true,
      insights: {
        select: { impressions: true, reach: true, likes: true, comments: true, shares: true },
      },
    },
  });

  if (publishResults.length === 0) return [];

  // Aggregate engagement per (hour, dayOfWeek) in user's timezone
  const buckets = new Map<string, { total: number; count: number; platforms: Set<Platform> }>();

  for (const r of publishResults) {
    if (!r.publishedAt || !r.insights) continue;
    const { hour, dayOfWeek } = toLocalHour(new Date(r.publishedAt), timezone);
    const key = `${hour}_${dayOfWeek}`;
    const ins = r.insights;
    const score =
      (ins.likes ?? 0) * 3 +
      (ins.comments ?? 0) * 5 +
      (ins.shares ?? 0) * 4 +
      (ins.reach ?? 0) * 1 +
      (ins.impressions ?? 0) * 0.5;

    const existing = buckets.get(key);
    if (existing) {
      existing.total += score;
      existing.count += 1;
      existing.platforms.add(r.platform);
    } else {
      buckets.set(key, { total: score, count: 1, platforms: new Set([r.platform]) });
    }
  }

  const ranked = Array.from(buckets.entries())
    .map(([key, { total, count, platforms: ps }]) => {
      const [hourStr, dayStr] = key.split("_");
      return {
        hour: parseInt(hourStr, 10),
        dayOfWeek: parseInt(dayStr, 10),
        avgScore: total / count,
        platforms: ps,
      };
    })
    .sort((a, b) => b.avgScore - a.avgScore);

  // Collect occupied times (SCHEDULED posts in next 14 days)
  const scheduledPosts = await prisma.post.findMany({
    where: {
      userId,
      status: { in: [PostStatus.SCHEDULED, PostStatus.PUBLISHING] },
      scheduledAt: { gte: now, lte: horizon },
    },
    select: { scheduledAt: true },
  });
  const occupiedMs = scheduledPosts.map((p) => p.scheduledAt!.getTime());

  const blackouts = await prisma.blackoutPeriod.findMany({
    where: { userId },
    select: { name: true, startDate: true, endDate: true, isRecurring: true, daysOfWeek: true },
  });

  const BUFFER_MS = 15 * 60_000;
  const suggestions: ScheduleSuggestion[] = [];
  const usedDatetimes = new Set<number>();

  for (const slot of ranked) {
    if (suggestions.length >= limit) break;

    const candidate = nextOccurrenceOfSlot(
      slot.hour,
      slot.dayOfWeek,
      timezone,
      now,
      14
    );
    if (!candidate) continue;
    if (candidate.getTime() <= now.getTime()) continue;

    // Skip if occupied
    if (occupiedMs.some((t) => Math.abs(t - candidate.getTime()) < BUFFER_MS)) continue;

    // Skip if in blackout
    if (blackouts.length > 0 && isInBlackout(candidate, blackouts) !== null) continue;

    // Skip duplicates (same UTC ms already added)
    if (usedDatetimes.has(candidate.getTime())) continue;
    usedDatetimes.add(candidate.getTime());

    const platformNames = Array.from(slot.platforms)
      .map((p) => p.charAt(0) + p.slice(1).toLowerCase())
      .join(", ");

    suggestions.push({
      datetime: candidate.toISOString(),
      dayLabel: DAY_NAMES[slot.dayOfWeek],
      timeLabel: formatTimeLabel(slot.hour),
      reason:
        platformNames
          ? `High engagement on ${platformNames} at this time`
          : "High engagement at this time",
      score: Math.round(slot.avgScore),
    });
  }

  return suggestions;
}
