export interface InsightsInput {
  impressions?: number | null;
  reach?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
}

/**
 * Weighted engagement score.
 * Higher-intent signals (comments, shares) outweigh passive reach.
 */
export function computeScore(insights: InsightsInput): number {
  const impressions = insights.impressions ?? 0;
  const reach = insights.reach ?? 0;
  const likes = insights.likes ?? 0;
  const comments = insights.comments ?? 0;
  const shares = insights.shares ?? 0;

  return (
    impressions * 0.5 +
    reach * 1 +
    likes * 3 +
    comments * 5 +
    shares * 4
  );
}

export function scoreLabel(score: number): "none" | "low" | "medium" | "high" | "viral" {
  if (score === 0) return "none";
  if (score < 50) return "low";
  if (score < 500) return "medium";
  if (score < 5000) return "high";
  return "viral";
}
