import { extractHashtags } from "@/lib/hashtag-analytics";

export type HashtagTrend = "rising" | "stable" | "falling";

export interface TrendingHashtag {
  hashtag: string;
  velocityScore: number;
  recentEngagement: number;
  baselineEngagement: number;
  trend: HashtagTrend;
  recentPostCount: number;
  baselinePostCount: number;
}

export interface PostForTrending {
  content: string;
  publishedAt: Date | null;
  insights: {
    likes: number | null;
    comments: number | null;
    shares: number | null;
    reach: number | null;
    impressions: number | null;
  }[];
}

function computeEngagement(insights: PostForTrending["insights"]): number {
  return insights.reduce((sum, ins) => {
    return (
      sum +
      (ins.likes ?? 0) * 3 +
      (ins.comments ?? 0) * 5 +
      (ins.shares ?? 0) * 4 +
      (ins.reach ?? 0) +
      (ins.impressions ?? 0) * 0.5
    );
  }, 0);
}

/**
 * Detect emerging/trending hashtags by comparing recent 7-day engagement
 * to the baseline (days 8–periodDays).
 *
 * velocityScore = (recentAvg / baselineAvg) * 100, or:
 *   - 150 when only recent data (new hashtag gaining traction)
 *   - 50 when only baseline data (fading hashtag)
 */
export function detectEmergingHashtags(
  posts: PostForTrending[],
  periodDays = 30,
  limit = 20
): TrendingHashtag[] {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

  type Bucket = { recent: number[]; baseline: number[] };
  const map = new Map<string, Bucket>();

  for (const post of posts) {
    if (!post.publishedAt) continue;
    const publishedAt = new Date(post.publishedAt);
    if (publishedAt < periodStart) continue;

    const hashtags = extractHashtags(post.content);
    if (hashtags.length === 0) continue;

    const engagement = computeEngagement(post.insights);
    const isRecent = publishedAt >= sevenDaysAgo;

    for (const tag of hashtags) {
      if (!map.has(tag)) map.set(tag, { recent: [], baseline: [] });
      const bucket = map.get(tag)!;
      if (isRecent) bucket.recent.push(engagement);
      else bucket.baseline.push(engagement);
    }
  }

  const results: TrendingHashtag[] = [];

  for (const [hashtag, bucket] of map.entries()) {
    const recentAvg =
      bucket.recent.length > 0
        ? bucket.recent.reduce((a, b) => a + b, 0) / bucket.recent.length
        : 0;

    const baselineAvg =
      bucket.baseline.length > 0
        ? bucket.baseline.reduce((a, b) => a + b, 0) / bucket.baseline.length
        : 0;

    let velocityScore: number;
    let trend: HashtagTrend;

    if (baselineAvg === 0 && recentAvg === 0) {
      velocityScore = 50;
      trend = "stable";
    } else if (baselineAvg === 0) {
      // New hashtag with recent activity
      velocityScore = 150;
      trend = "rising";
    } else if (recentAvg === 0) {
      // Hashtag used only in baseline, now dormant
      velocityScore = 10;
      trend = "falling";
    } else {
      const ratio = recentAvg / baselineAvg;
      velocityScore = Math.round(ratio * 100);
      if (ratio >= 1.2) trend = "rising";
      else if (ratio <= 0.8) trend = "falling";
      else trend = "stable";
    }

    results.push({
      hashtag,
      velocityScore,
      recentEngagement: Math.round(recentAvg),
      baselineEngagement: Math.round(baselineAvg),
      trend,
      recentPostCount: bucket.recent.length,
      baselinePostCount: bucket.baseline.length,
    });
  }

  return results
    .sort((a, b) => {
      // Prioritize "rising" trend, then by velocity score
      const trendOrder: Record<HashtagTrend, number> = { rising: 2, stable: 1, falling: 0 };
      const trendDiff = trendOrder[b.trend] - trendOrder[a.trend];
      if (trendDiff !== 0) return trendDiff;
      return b.velocityScore - a.velocityScore;
    })
    .slice(0, limit);
}
