export interface SeasonalTopPost {
  postId: string;
  content: string;
  engagement: number;
  publishedAt: Date;
}

export interface SeasonalPattern {
  /** Month number 1–12 */
  month: number;
  /** Full month name e.g. "January" */
  monthName: string;
  postCount: number;
  avgEngagement: number;
  totalEngagement: number;
  /** Top posts in this month by engagement, capped at 5 */
  topPosts: SeasonalTopPost[];
}

export interface SeasonalPatternsResult {
  patterns: SeasonalPattern[];
  /** Month number (1–12) with highest avgEngagement, or null when no data */
  bestMonth: number | null;
  /** Month number (1–12) with lowest avgEngagement (≥1 post), or null */
  worstMonth: number | null;
  totalPosts: number;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

interface PostInput {
  id: string;
  content: string;
  engagement: number;
  /** Date to bucket by (e.g. publishedAt from PublishResult) */
  publishedAt: Date;
}

/**
 * Groups posts by calendar month and computes per-month engagement stats.
 */
export function computeSeasonalPatterns(
  posts: PostInput[]
): SeasonalPatternsResult {
  if (posts.length === 0) {
    return { patterns: [], bestMonth: null, worstMonth: null, totalPosts: 0 };
  }

  // Bucket posts by month (1–12)
  const buckets = new Map<number, PostInput[]>();
  for (let m = 1; m <= 12; m++) {
    buckets.set(m, []);
  }

  for (const post of posts) {
    const month = post.publishedAt.getMonth() + 1; // 0-indexed → 1-indexed
    buckets.get(month)!.push(post);
  }

  const patterns: SeasonalPattern[] = [];
  let bestMonth: number | null = null;
  let worstMonth: number | null = null;
  let bestAvg = -1;
  let worstAvg = Infinity;

  for (let month = 1; month <= 12; month++) {
    const monthPosts = buckets.get(month)!;
    const postCount = monthPosts.length;
    const totalEngagement = monthPosts.reduce((s, p) => s + p.engagement, 0);
    const avgEngagement = postCount > 0 ? totalEngagement / postCount : 0;

    // Top 5 posts by engagement
    const topPosts: SeasonalTopPost[] = [...monthPosts]
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, 5)
      .map((p) => ({
        postId: p.id,
        content: p.content,
        engagement: p.engagement,
        publishedAt: p.publishedAt,
      }));

    patterns.push({
      month,
      monthName: MONTH_NAMES[month - 1],
      postCount,
      avgEngagement,
      totalEngagement,
      topPosts,
    });

    if (postCount > 0) {
      if (avgEngagement > bestAvg) {
        bestAvg = avgEngagement;
        bestMonth = month;
      }
      if (avgEngagement < worstAvg) {
        worstAvg = avgEngagement;
        worstMonth = month;
      }
    }
  }

  return {
    patterns,
    bestMonth,
    worstMonth,
    totalPosts: posts.length,
  };
}
