/**
 * Queue Health utility — evaluates the publishing runway and content queue status.
 *
 * Computes how many SCHEDULED posts the user has queued and estimates how many
 * days of content remain at the current posting velocity, plus identifies any
 * content gaps (days in the next 14 days with no scheduled posts).
 */

export type QueueStatus = "healthy" | "low" | "critical" | "empty";

export interface ContentGap {
  /** ISO date string (YYYY-MM-DD) */
  date: string;
  dayOfWeek: string;
}

export interface QueueHealthResult {
  /** Number of SCHEDULED posts */
  scheduledCount: number;
  /** Average posts per day over the next 30 days (based on scheduled distribution) */
  avgPostsPerDay: number;
  /** Estimated days of content runway (scheduledCount / avgPostsPerWeek * 7) */
  queueRunwayDays: number;
  /** Overall queue status */
  queueStatus: QueueStatus;
  /** Days in the next 14 days with no scheduled posts */
  contentGapDays: ContentGap[];
  /** ISO string of the next scheduled post, or null */
  nextScheduledAt: string | null;
  /** Platform breakdown of scheduled posts */
  platformBreakdown: { platform: string; count: number }[];
}

export interface ScheduledPost {
  scheduledAt: Date;
  platforms: string[];
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function computeQueueHealth(scheduledPosts: ScheduledPost[]): QueueHealthResult {
  const now = new Date();
  const scheduledCount = scheduledPosts.length;

  // Next scheduled post
  const futurePosts = scheduledPosts
    .filter((p) => p.scheduledAt > now)
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

  const nextScheduledAt = futurePosts.length > 0 ? futurePosts[0].scheduledAt.toISOString() : null;

  // Average posts per day (using 30-day window of future scheduled posts)
  const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const postsIn30Days = futurePosts.filter((p) => p.scheduledAt <= thirtyDaysOut).length;
  const avgPostsPerDay = Math.round((postsIn30Days / 30) * 100) / 100;

  // Queue runway days — use date of last post within 30-day window
  let queueRunwayDays = 0;
  const postsWithin30 = futurePosts.filter((p) => p.scheduledAt <= thirtyDaysOut);
  if (postsWithin30.length > 0) {
    const lastPost = postsWithin30[postsWithin30.length - 1];
    queueRunwayDays = Math.round(
      (lastPost.scheduledAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
    );
  } else if (scheduledCount > 0) {
    // Posts exist but distributed beyond 30 days
    queueRunwayDays = scheduledCount * 7;
  }

  // Queue status
  let queueStatus: QueueStatus;
  if (scheduledCount === 0) {
    queueStatus = "empty";
  } else if (queueRunwayDays >= 14) {
    queueStatus = "healthy";
  } else if (queueRunwayDays >= 7) {
    queueStatus = "low";
  } else {
    queueStatus = "critical";
  }

  // Content gap days (next 14 days with no scheduled posts)
  const scheduledDates = new Set(futurePosts.map((p) => toISODate(p.scheduledAt)));
  const contentGapDays: ContentGap[] = [];
  for (let i = 1; i <= 14; i++) {
    const day = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const dateStr = toISODate(day);
    if (!scheduledDates.has(dateStr)) {
      contentGapDays.push({
        date: dateStr,
        dayOfWeek: DAY_NAMES[day.getDay()],
      });
    }
  }

  // Platform breakdown
  const platformMap = new Map<string, number>();
  for (const post of scheduledPosts) {
    for (const platform of post.platforms) {
      platformMap.set(platform, (platformMap.get(platform) ?? 0) + 1);
    }
  }
  const platformBreakdown = Array.from(platformMap.entries())
    .map(([platform, count]) => ({ platform, count }))
    .sort((a, b) => b.count - a.count);

  return {
    scheduledCount,
    avgPostsPerDay,
    queueRunwayDays,
    queueStatus,
    contentGapDays,
    nextScheduledAt,
    platformBreakdown,
  };
}
