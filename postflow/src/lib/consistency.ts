/**
 * Posting consistency utilities.
 *
 * A "consistency score" (0-100) measures how regularly a user posts over a
 * given period.  Higher scores mean more evenly-distributed publishing
 * activity.  The score is computed as:
 *
 *   filled_weeks / total_weeks * 100
 *
 * where "filled" means the week had at least one published or scheduled post.
 *
 * Additional metrics returned:
 *  - streak      : current consecutive weeks (from most recent back) with ≥1 post
 *  - avgPerWeek  : mean posts per week over the period
 *  - gaps        : date ranges of ≥7 consecutive days with no posts
 */

export interface ContentGap {
  /** ISO date string (YYYY-MM-DD) of the first day with no post */
  start: string;
  /** ISO date string (YYYY-MM-DD) of the last day with no post */
  end: string;
  /** Number of consecutive days with no posts */
  days: number;
}

export interface ConsistencyResult {
  /** 0–100 score */
  score: number;
  /** Consecutive weeks (ending today) with ≥1 post */
  streak: number;
  /** Mean posts per 7-day week over the period */
  avgPostsPerWeek: number;
  /** Gaps of ≥7 days with no posts within the analysis window */
  gaps: ContentGap[];
  /** Total posts counted in the period */
  totalPosts: number;
  /** Length of the analysis window in days */
  periodDays: number;
}

/** Format a Date as "YYYY-MM-DD" in UTC. */
function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Compute consistency metrics from an array of post dates.
 *
 * @param postDates  Dates of published/scheduled posts (duplicates allowed).
 * @param periodDays Number of days to analyse (counting back from `now`).
 * @param now        Reference "today" — defaults to the actual current time.
 */
export function computeConsistency(
  postDates: Date[],
  periodDays: number,
  now: Date = new Date()
): ConsistencyResult {
  // Build a set of "YYYY-MM-DD" strings for days that have a post.
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const windowStart = new Date(today);
  windowStart.setDate(today.getDate() - periodDays + 1);

  const daySet = new Set<string>();
  for (const d of postDates) {
    const day = new Date(d);
    day.setHours(0, 0, 0, 0);
    if (day >= windowStart && day <= today) {
      daySet.add(toDateStr(day));
    }
  }

  const totalPosts = daySet.size === 0 ? 0 : postDates.filter((d) => {
    const day = new Date(d);
    day.setHours(0, 0, 0, 0);
    return day >= windowStart && day <= today;
  }).length;

  // ── Week buckets (Sunday-anchored ISO weeks within the window) ─────────────
  // We use Sunday-aligned buckets of exactly 7 days for simplicity.
  const totalWeeks = Math.ceil(periodDays / 7);

  let filledWeeks = 0;
  for (let w = 0; w < totalWeeks; w++) {
    const weekEnd = new Date(today);
    weekEnd.setDate(today.getDate() - w * 7);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekEnd.getDate() - 6);
    if (weekStart < windowStart) weekStart.setTime(windowStart.getTime());

    let hasPost = false;
    const cursor = new Date(weekStart);
    while (cursor <= weekEnd) {
      if (daySet.has(toDateStr(cursor))) {
        hasPost = true;
        break;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    if (hasPost) filledWeeks++;
  }

  const score = totalWeeks === 0 ? 0 : Math.round((filledWeeks / totalWeeks) * 100);

  // ── Streak: consecutive weeks ending at the most recent week ───────────────
  let streak = 0;
  for (let w = 0; w < totalWeeks; w++) {
    const weekEnd = new Date(today);
    weekEnd.setDate(today.getDate() - w * 7);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekEnd.getDate() - 6);
    if (weekStart < windowStart) weekStart.setTime(windowStart.getTime());

    let hasPost = false;
    const cursor = new Date(weekStart);
    while (cursor <= weekEnd) {
      if (daySet.has(toDateStr(cursor))) {
        hasPost = true;
        break;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    if (hasPost) streak++;
    else break;
  }

  // ── Average posts per week ─────────────────────────────────────────────────
  const avgPostsPerWeek =
    totalWeeks === 0 ? 0 : Math.round((totalPosts / totalWeeks) * 10) / 10;

  // ── Content gaps: consecutive runs of ≥7 days with no post ────────────────
  const gaps: ContentGap[] = [];
  let gapStart: Date | null = null;
  let gapLen = 0;

  const cursor = new Date(windowStart);
  while (cursor <= today) {
    const ds = toDateStr(cursor);
    if (!daySet.has(ds)) {
      if (gapStart === null) {
        gapStart = new Date(cursor);
        gapLen = 1;
      } else {
        gapLen++;
      }
    } else {
      if (gapStart !== null && gapLen >= 7) {
        const gapEnd = new Date(cursor);
        gapEnd.setDate(gapEnd.getDate() - 1);
        gaps.push({
          start: toDateStr(gapStart),
          end: toDateStr(gapEnd),
          days: gapLen,
        });
      }
      gapStart = null;
      gapLen = 0;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  // Close a trailing gap
  if (gapStart !== null && gapLen >= 7) {
    const gapEnd = new Date(cursor);
    gapEnd.setDate(gapEnd.getDate() - 1);
    gaps.push({
      start: toDateStr(gapStart),
      end: toDateStr(gapEnd),
      days: gapLen,
    });
  }

  return { score, streak, avgPostsPerWeek, gaps, totalPosts, periodDays };
}
