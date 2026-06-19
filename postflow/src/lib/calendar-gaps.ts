export interface CalendarGap {
  date: string; // YYYY-MM-DD
  dayOfWeek: number; // 0=Sun, 6=Sat
  isWeekend: boolean;
  hoursEmpty: number; // 24 for full-day gaps
}

export interface CalendarGapResult {
  gaps: CalendarGap[];
  totalGaps: number;
  coveredDays: number;
  analyzedDays: number;
  gapRate: number; // 0-100
  longestStreakDays: number;
}

/**
 * Detects days in the next `windowDays` days (starting tomorrow UTC) that have
 * no scheduled posts.
 */
export function detectCalendarGaps(
  scheduledPosts: { scheduledAt: Date | null }[],
  windowDays: number = 14
): CalendarGapResult {
  // Build a set of covered date strings (YYYY-MM-DD) in UTC
  const coveredDates = new Set<string>();

  for (const post of scheduledPosts) {
    if (!post.scheduledAt) continue;
    const d = post.scheduledAt;
    const dateStr = d.toISOString().slice(0, 10); // YYYY-MM-DD
    coveredDates.add(dateStr);
  }

  // Window starts tomorrow UTC
  const tomorrow = new Date();
  tomorrow.setUTCHours(0, 0, 0, 0);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  const gaps: CalendarGap[] = [];
  let longestStreakDays = 0;
  let currentStreak = 0;

  for (let i = 0; i < windowDays; i++) {
    const day = new Date(tomorrow);
    day.setUTCDate(day.getUTCDate() + i);

    const dateStr = day.toISOString().slice(0, 10);
    const dayOfWeek = day.getUTCDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    if (!coveredDates.has(dateStr)) {
      gaps.push({
        date: dateStr,
        dayOfWeek,
        isWeekend,
        hoursEmpty: 24,
      });
      currentStreak += 1;
      if (currentStreak > longestStreakDays) {
        longestStreakDays = currentStreak;
      }
    } else {
      currentStreak = 0;
    }
  }

  const totalGaps = gaps.length;
  const analyzedDays = windowDays;
  const coveredDays = analyzedDays - totalGaps;
  const gapRate = Math.round((totalGaps / analyzedDays) * 100);

  return {
    gaps,
    totalGaps,
    coveredDays,
    analyzedDays,
    gapRate,
    longestStreakDays,
  };
}
