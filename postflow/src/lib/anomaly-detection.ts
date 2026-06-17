/**
 * Anomaly Detection — z-score based engagement anomaly detector.
 *
 * Computes a 30-day baseline mean and standard deviation for each platform's
 * weighted engagement score, then flags posts whose score deviates by more
 * than ±2 standard deviations as spikes or drops.
 *
 * Weighted engagement formula (same as viral-detection):
 *   likes×3 + comments×5 + shares×4 + reach×1 + impressions×0.5
 */

export type AnomalyType = "spike" | "drop";

export interface PostAnomalyMetrics {
  likes: number;
  comments: number;
  shares: number;
  reach: number;
  impressions: number;
}

export interface PostAnomaly {
  postId: string;
  content: string;
  platform: string;
  publishedAt: Date | null;
  engagementScore: number;
  mean: number;
  stddev: number;
  zScore: number;
  anomalyType: AnomalyType;
  metrics: PostAnomalyMetrics;
}

export interface AnomalyDetectionResult {
  anomalies: PostAnomaly[];
  /** Total posts analysed across all platforms */
  totalAnalyzed: number;
  /** Per-platform stats used to build baselines */
  platformBaselines: {
    platform: string;
    mean: number;
    stddev: number;
    sampleSize: number;
  }[];
}

export interface PostForAnomaly {
  postId: string;
  content: string;
  platform: string;
  publishedAt: Date | null;
  insights: {
    likes?: number | null;
    comments?: number | null;
    shares?: number | null;
    reach?: number | null;
    impressions?: number | null;
  };
}

/** Weighted engagement formula (mirrors viral-detection.ts) */
export function computeWeightedEngagement(
  likes: number,
  comments: number,
  shares: number,
  reach: number,
  impressions: number
): number {
  return likes * 3 + comments * 5 + shares * 4 + reach + impressions * 0.5;
}

export function computeZScore(value: number, mean: number, stddev: number): number {
  if (stddev === 0) return 0;
  return (value - mean) / stddev;
}

function computeMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function computeStddev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Detect posts with anomalously high (spike) or low (drop) engagement
 * compared to the user's own per-platform baseline.
 *
 * Requires at least 3 posts per platform to compute a meaningful baseline.
 * Returns anomalies sorted by absolute z-score descending.
 */
export function detectEngagementAnomalies(
  posts: PostForAnomaly[],
  zThreshold = 2.0
): AnomalyDetectionResult {
  // Group engagement scores by platform
  const platformScores = new Map<string, { postIndex: number; score: number }[]>();

  const enriched = posts.map((post, idx) => {
    const likes = post.insights.likes ?? 0;
    const comments = post.insights.comments ?? 0;
    const shares = post.insights.shares ?? 0;
    const reach = post.insights.reach ?? 0;
    const impressions = post.insights.impressions ?? 0;
    const score = computeWeightedEngagement(likes, comments, shares, reach, impressions);

    if (!platformScores.has(post.platform)) {
      platformScores.set(post.platform, []);
    }
    platformScores.get(post.platform)!.push({ postIndex: idx, score });

    return {
      ...post,
      likes,
      comments,
      shares,
      reach,
      impressions,
      score,
    };
  });

  // Build baselines per platform
  const baselines: AnomalyDetectionResult["platformBaselines"] = [];
  const platformStats = new Map<string, { mean: number; stddev: number; sampleSize: number }>();

  for (const [platform, entries] of platformScores.entries()) {
    const scores = entries.map((e) => e.score);
    const mean = computeMean(scores);
    const stddev = computeStddev(scores, mean);
    platformStats.set(platform, { mean, stddev, sampleSize: scores.length });
    baselines.push({ platform, mean, stddev, sampleSize: scores.length });
  }

  // Detect anomalies (need ≥3 samples per platform)
  const anomalies: PostAnomaly[] = [];

  for (const post of enriched) {
    const stats = platformStats.get(post.platform);
    if (!stats || stats.sampleSize < 3) continue;

    const z = computeZScore(post.score, stats.mean, stats.stddev);
    const absZ = Math.abs(z);

    if (absZ >= zThreshold) {
      anomalies.push({
        postId: post.postId,
        content: post.content,
        platform: post.platform,
        publishedAt: post.publishedAt,
        engagementScore: post.score,
        mean: stats.mean,
        stddev: stats.stddev,
        zScore: z,
        anomalyType: z > 0 ? "spike" : "drop",
        metrics: {
          likes: post.likes,
          comments: post.comments,
          shares: post.shares,
          reach: post.reach,
          impressions: post.impressions,
        },
      });
    }
  }

  // Sort by absolute z-score descending (biggest deviations first)
  anomalies.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));

  return {
    anomalies,
    totalAnalyzed: posts.length,
    platformBaselines: baselines.sort((a, b) => b.sampleSize - a.sampleSize),
  };
}
