export interface HashtagStat {
  hashtag: string;
  postCount: number;
  totalImpressions: number;
  totalReach: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  avgEngagement: number;
}

interface InsightData {
  impressions: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
}

/**
 * Extract unique hashtags from post content (lowercase, without #).
 */
export function extractHashtags(content: string): string[] {
  const matches = content.match(/#(\w+)/g);
  if (!matches) return [];
  return [...new Set(matches.map((tag) => tag.slice(1).toLowerCase()))];
}

/**
 * Weighted engagement score: likes×3 + comments×5 + shares×4 + reach×1 + impressions×0.5
 */
export function computeEngagementScore(ins: InsightData): number {
  return (
    (ins.likes ?? 0) * 3 +
    (ins.comments ?? 0) * 5 +
    (ins.shares ?? 0) * 4 +
    (ins.reach ?? 0) * 1 +
    (ins.impressions ?? 0) * 0.5
  );
}

/**
 * Compute per-hashtag engagement stats from posts and their platform insights.
 * Posts with no insights still count toward postCount (engagement = 0).
 */
export function computeHashtagStats(
  posts: { content: string; insights: InsightData[] }[],
  limit = 30
): HashtagStat[] {
  const statsMap = new Map<
    string,
    {
      postCount: number;
      totalEngagement: number;
      totalImpressions: number;
      totalReach: number;
      totalLikes: number;
      totalComments: number;
      totalShares: number;
    }
  >();

  for (const post of posts) {
    const hashtags = extractHashtags(post.content);
    if (hashtags.length === 0) continue;

    // Sum insights across all platforms for this post
    type AggSums = {
      impressions: number;
      reach: number;
      likes: number;
      comments: number;
      shares: number;
    };
    const agg = post.insights.reduce<AggSums>(
      (acc, ins) => ({
        impressions: acc.impressions + (ins.impressions ?? 0),
        reach: acc.reach + (ins.reach ?? 0),
        likes: acc.likes + (ins.likes ?? 0),
        comments: acc.comments + (ins.comments ?? 0),
        shares: acc.shares + (ins.shares ?? 0),
      }),
      { impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0 }
    );

    const engagement = computeEngagementScore(agg);

    for (const tag of hashtags) {
      const existing = statsMap.get(tag) ?? {
        postCount: 0,
        totalEngagement: 0,
        totalImpressions: 0,
        totalReach: 0,
        totalLikes: 0,
        totalComments: 0,
        totalShares: 0,
      };

      existing.postCount += 1;
      existing.totalEngagement += engagement;
      existing.totalImpressions += agg.impressions;
      existing.totalReach += agg.reach;
      existing.totalLikes += agg.likes;
      existing.totalComments += agg.comments;
      existing.totalShares += agg.shares;
      statsMap.set(tag, existing);
    }
  }

  return Array.from(statsMap.entries())
    .map(([hashtag, s]) => ({
      hashtag,
      postCount: s.postCount,
      totalImpressions: s.totalImpressions,
      totalReach: s.totalReach,
      totalLikes: s.totalLikes,
      totalComments: s.totalComments,
      totalShares: s.totalShares,
      avgEngagement: s.postCount > 0 ? s.totalEngagement / s.postCount : 0,
    }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement || b.postCount - a.postCount)
    .slice(0, limit);
}
