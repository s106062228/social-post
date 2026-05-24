export type FatigueTrend = "improving" | "stable" | "declining";

export interface PlatformFatigueData {
  platform: string;
  recentAvgEngagement: number;
  baselineAvgEngagement: number;
  fatigueScore: number;
  isFatigued: boolean;
  trend: FatigueTrend;
  recentPostCount: number;
  baselinePostCount: number;
}

export interface ContentFatigueResult {
  overallFatigued: boolean;
  platforms: PlatformFatigueData[];
  analyzedAt: string;
}

export interface PostForFatigue {
  publishResults: {
    platform: string;
    status: string;
    publishedAt: Date | null;
    insights: {
      likes: number;
      comments: number;
      shares: number;
      reach: number;
      impressions: number;
    } | null;
  }[];
}

function computeEngagement(
  insights: PostForFatigue["publishResults"][number]["insights"]
): number {
  if (!insights) return 0;
  return (
    insights.likes * 3 +
    insights.comments * 5 +
    insights.shares * 4 +
    insights.reach
  );
}

export function detectContentFatigue(
  posts: PostForFatigue[],
  targetPlatform?: string
): ContentFatigueResult {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const platformBuckets = new Map<
    string,
    { recent: number[]; baseline: number[] }
  >();

  for (const post of posts) {
    for (const result of post.publishResults) {
      if (result.status !== "PUBLISHED" || !result.publishedAt) continue;
      if (targetPlatform && result.platform !== targetPlatform) continue;

      const publishedAt = new Date(result.publishedAt);
      if (publishedAt < thirtyDaysAgo) continue;

      const engagement = computeEngagement(result.insights);

      if (!platformBuckets.has(result.platform)) {
        platformBuckets.set(result.platform, { recent: [], baseline: [] });
      }

      const buckets = platformBuckets.get(result.platform)!;
      if (publishedAt >= sevenDaysAgo) {
        buckets.recent.push(engagement);
      } else {
        buckets.baseline.push(engagement);
      }
    }
  }

  const platforms: PlatformFatigueData[] = [];

  for (const [platform, buckets] of platformBuckets.entries()) {
    if (buckets.recent.length === 0 && buckets.baseline.length === 0) continue;

    const recentAvg =
      buckets.recent.length > 0
        ? buckets.recent.reduce((a, b) => a + b, 0) / buckets.recent.length
        : 0;

    const baselineAvg =
      buckets.baseline.length > 0
        ? buckets.baseline.reduce((a, b) => a + b, 0) / buckets.baseline.length
        : 0;

    let fatigueScore: number;
    let trend: FatigueTrend;

    if (baselineAvg === 0) {
      fatigueScore = 75;
      trend = "stable";
    } else {
      const ratio = recentAvg / baselineAvg;
      fatigueScore = Math.min(100, Math.max(0, Math.round(ratio * 100)));
      if (ratio >= 1.1) trend = "improving";
      else if (ratio <= 0.7) trend = "declining";
      else trend = "stable";
    }

    const isFatigued = baselineAvg > 0 && recentAvg / baselineAvg <= 0.7;

    platforms.push({
      platform,
      recentAvgEngagement: Math.round(recentAvg),
      baselineAvgEngagement: Math.round(baselineAvg),
      fatigueScore,
      isFatigued,
      trend,
      recentPostCount: buckets.recent.length,
      baselinePostCount: buckets.baseline.length,
    });
  }

  platforms.sort((a, b) => a.fatigueScore - b.fatigueScore);

  return {
    overallFatigued: platforms.some((p) => p.isFatigued),
    platforms,
    analyzedAt: now.toISOString(),
  };
}
