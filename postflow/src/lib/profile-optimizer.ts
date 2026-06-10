import { RECOMMENDED_FREQUENCY } from "@/lib/posting-frequency";
import { PLATFORM_BENCHMARKS } from "@/lib/engagement-benchmarks";

export type ProfileGrade = "A" | "B" | "C" | "D" | "F";
export type TipPriority = "high" | "medium" | "low";

export interface ProfileDimension {
  name: string;
  score: number;
  max: number;
  label: string;
}

export interface ProfileTip {
  dimension: string;
  tip: string;
  priority: TipPriority;
  action: string;
}

export interface ProfileScore {
  overallScore: number;
  grade: ProfileGrade;
  dimensions: ProfileDimension[];
  tips: ProfileTip[];
}

export interface ProfileOptimizerInput {
  platform: string;
  postsLast90d: number;
  /** timestamps (ms) of each published post, sorted ascending */
  publishedTimestamps: number[];
  avgEngagementRate: number; // (likes+comments+shares)/reach * 100
  followerCounts: { syncedAt: number; followersCount: number | null }[];
}

function gradeFromScore(score: number): ProfileGrade {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

function dimensionLabel(score: number, max: number): string {
  const pct = max > 0 ? score / max : 0;
  if (pct >= 0.85) return "Excellent";
  if (pct >= 0.65) return "Good";
  if (pct >= 0.40) return "Fair";
  return "Needs Work";
}

/** Compute posting interval consistency — lower stddev relative to mean = better */
function computeConsistencyScore(timestamps: number[]): number {
  if (timestamps.length < 2) return 0;

  const intervals: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    intervals.push(timestamps[i] - timestamps[i - 1]);
  }

  const mean = intervals.reduce((s, v) => s + v, 0) / intervals.length;
  if (mean === 0) return 25;

  const variance =
    intervals.reduce((s, v) => s + (v - mean) ** 2, 0) / intervals.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean; // coefficient of variation (0 = perfectly consistent)

  // cv ≤ 0.5 → full marks, cv ≥ 2 → 0 marks
  const normalized = Math.max(0, Math.min(1, 1 - (cv - 0.5) / 1.5));
  return Math.round(normalized * 25);
}

/** Compute 30-day follower growth score based on trend */
function computeGrowthScore(
  followerCounts: ProfileOptimizerInput["followerCounts"]
): number {
  if (followerCounts.length < 2) return 10; // neutral when no data

  const sorted = [...followerCounts].sort((a, b) => a.syncedAt - b.syncedAt);
  const oldest = sorted[0].followersCount;
  const newest = sorted[sorted.length - 1].followersCount;

  if (oldest === null || newest === null || oldest === 0) return 10;

  const growthPct = ((newest - oldest) / oldest) * 100;

  // ≥5% → full marks, 0% → half, negative → low
  if (growthPct >= 5) return 25;
  if (growthPct >= 2) return 20;
  if (growthPct >= 0) return 12;
  if (growthPct >= -2) return 6;
  return 0;
}

export function computeProfileScore(input: ProfileOptimizerInput): ProfileScore {
  const {
    platform,
    postsLast90d,
    publishedTimestamps,
    avgEngagementRate,
    followerCounts,
  } = input;

  // ── Activity (0–25): posts per week vs recommended ─────────────────────────
  const recommendedPerWeek = RECOMMENDED_FREQUENCY[platform] ?? 5;
  const actualPerWeek = postsLast90d / 13; // 90d ≈ 13 weeks
  const activityRatio = actualPerWeek / recommendedPerWeek;
  // Full marks at 100% of recommended, penalty for under/over (over-capped at 1.5×)
  let activityScore: number;
  if (activityRatio >= 0.9 && activityRatio <= 1.5) {
    activityScore = 25;
  } else if (activityRatio > 1.5) {
    activityScore = Math.max(15, Math.round(25 - (activityRatio - 1.5) * 10));
  } else {
    activityScore = Math.round(activityRatio * 25);
  }

  // ── Engagement (0–25): avgEngagementRate vs benchmark ─────────────────────
  const benchmark = PLATFORM_BENCHMARKS[platform as keyof typeof PLATFORM_BENCHMARKS];
  let engagementScore: number;
  if (benchmark) {
    const ratio = avgEngagementRate / benchmark.engagementRate;
    if (ratio >= 1.5) engagementScore = 25;
    else if (ratio >= 1.0) engagementScore = Math.round(20 + (ratio - 1.0) * 10);
    else engagementScore = Math.round(ratio * 20);
  } else {
    // No benchmark: give proportional score up to typical 1% ER
    engagementScore = Math.min(25, Math.round(avgEngagementRate * 25));
  }

  // ── Growth (0–25) ──────────────────────────────────────────────────────────
  const growthScore = computeGrowthScore(followerCounts);

  // ── Consistency (0–25) ────────────────────────────────────────────────────
  const consistencyScore = computeConsistencyScore(publishedTimestamps);

  const overallScore = Math.min(
    100,
    activityScore + engagementScore + growthScore + consistencyScore
  );

  const dimensions: ProfileDimension[] = [
    {
      name: "Activity",
      score: activityScore,
      max: 25,
      label: dimensionLabel(activityScore, 25),
    },
    {
      name: "Engagement",
      score: engagementScore,
      max: 25,
      label: dimensionLabel(engagementScore, 25),
    },
    {
      name: "Growth",
      score: growthScore,
      max: 25,
      label: dimensionLabel(growthScore, 25),
    },
    {
      name: "Consistency",
      score: consistencyScore,
      max: 25,
      label: dimensionLabel(consistencyScore, 25),
    },
  ];

  const tips: ProfileTip[] = [];

  if (activityScore < 15) {
    tips.push({
      dimension: "Activity",
      tip: `You're posting ${actualPerWeek.toFixed(1)} times/week but ${platform} performs best at ${recommendedPerWeek}/week.`,
      priority: activityScore < 8 ? "high" : "medium",
      action: "Schedule more posts",
    });
  } else if (activityScore < 20) {
    tips.push({
      dimension: "Activity",
      tip: `Slightly below recommended pace. Aim for ${recommendedPerWeek} posts/week to maximise reach.`,
      priority: "low",
      action: "Add a few more posts",
    });
  }

  if (engagementScore < 12) {
    tips.push({
      dimension: "Engagement",
      tip: benchmark
        ? `Your engagement rate (${avgEngagementRate.toFixed(2)}%) is below the ${platform} benchmark (${benchmark.engagementRate}%). Try more questions, polls, or calls-to-action.`
        : `Low engagement detected. Add questions and CTAs to boost interaction.`,
      priority: "high",
      action: "Improve post CTAs",
    });
  } else if (engagementScore < 20) {
    tips.push({
      dimension: "Engagement",
      tip: "Good engagement, but there's room to grow. Experiment with different content formats.",
      priority: "medium",
      action: "Try video or carousel posts",
    });
  }

  if (growthScore < 10) {
    tips.push({
      dimension: "Growth",
      tip: "Follower count is declining or stagnant. Consider collaboration posts, hashtag campaigns, or cross-promotion.",
      priority: "high",
      action: "Run a follower growth campaign",
    });
  } else if (growthScore < 18) {
    tips.push({
      dimension: "Growth",
      tip: "Moderate follower growth. Consistent posting and engaging with your audience will accelerate it.",
      priority: "low",
      action: "Engage with comments",
    });
  }

  if (consistencyScore < 10) {
    tips.push({
      dimension: "Consistency",
      tip: "Irregular posting schedule detected. Algorithms favour accounts that post predictably.",
      priority: "high",
      action: "Set up a recurring schedule",
    });
  } else if (consistencyScore < 18) {
    tips.push({
      dimension: "Consistency",
      tip: "Your posting cadence is somewhat irregular. Consider using queue slots to fill gaps.",
      priority: "medium",
      action: "Add posts to your queue",
    });
  }

  // Sort tips: high → medium → low
  const priorityOrder: Record<TipPriority, number> = {
    high: 0,
    medium: 1,
    low: 2,
  };
  tips.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return { overallScore, grade: gradeFromScore(overallScore), dimensions, tips };
}
