export const MILESTONE_THRESHOLDS = [
  100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000,
  500000, 1000000,
];

export function getMilestonesCrossed(
  previousCount: number,
  currentCount: number
): number[] {
  return MILESTONE_THRESHOLDS.filter(
    (m) => previousCount < m && currentCount >= m
  );
}

export function getNextMilestone(currentCount: number): number | null {
  return MILESTONE_THRESHOLDS.find((m) => m > currentCount) ?? null;
}

export function formatMilestone(count: number): string {
  if (count >= 1_000_000) return `${count / 1_000_000}M`;
  if (count >= 1_000) return `${count / 1_000}K`;
  return count.toString();
}

// Simple linear regression for growth projection
export function projectGrowth(
  metrics: { followersCount: number; syncedAt: Date }[],
  projectionDays: number[]
): { days: number; projected: number }[] {
  if (metrics.length < 2)
    return projectionDays.map((d) => ({
      days: d,
      projected: metrics[0]?.followersCount ?? 0,
    }));

  const sorted = [...metrics].sort(
    (a, b) => a.syncedAt.getTime() - b.syncedAt.getTime()
  );
  const n = sorted.length;
  const now = Date.now();

  // Convert to days relative to first data point
  const points = sorted.map((m) => ({
    x:
      (m.syncedAt.getTime() - sorted[0].syncedAt.getTime()) /
      (1000 * 60 * 60 * 24),
    y: m.followersCount,
  }));

  // Least-squares linear regression
  const sumX = points.reduce((a, p) => a + p.x, 0);
  const sumY = points.reduce((a, p) => a + p.y, 0);
  const sumXY = points.reduce((a, p) => a + p.x * p.y, 0);
  const sumX2 = points.reduce((a, p) => a + p.x * p.x, 0);

  const denominator = n * sumX2 - sumX * sumX;
  const slope = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;
  const intercept = (sumY - slope * sumX) / n;

  const lastX =
    (now - sorted[0].syncedAt.getTime()) / (1000 * 60 * 60 * 24);

  return projectionDays.map((days) => ({
    days,
    projected: Math.max(0, Math.round(intercept + slope * (lastX + days))),
  }));
}

export function computeGrowthRate(
  metrics: { followersCount: number; syncedAt: Date }[]
): number {
  if (metrics.length < 2) return 0;
  const sorted = [...metrics].sort(
    (a, b) => a.syncedAt.getTime() - b.syncedAt.getTime()
  );
  const oldest = sorted[0];
  const newest = sorted[sorted.length - 1];
  const daysDiff =
    (newest.syncedAt.getTime() - oldest.syncedAt.getTime()) /
    (1000 * 60 * 60 * 24);
  if (daysDiff === 0 || oldest.followersCount === 0) return 0;
  const totalGrowth = newest.followersCount - oldest.followersCount;
  return totalGrowth / daysDiff; // followers per day
}
