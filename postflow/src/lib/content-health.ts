/**
 * Content Health scoring utility.
 *
 * Synthesises five dimensions into a single 0-100 health score:
 *  1. Diversity       (30 pts) — variety of content categories used
 *  2. Platform Coverage (20 pts) — % of active accounts posted to
 *  3. Regularity      (20 pts) — based on consistency score
 *  4. Engagement Trend (20 pts) — current vs prior-period engagement
 *  5. Freshness       (10 pts) — original vs recycled posts
 */

export interface ContentHealthDimension {
  name: string;
  score: number; // 0 – max
  max: number;
  label: string; // e.g. "Excellent", "Good", "Fair", "Poor"
  detail: string; // one-sentence explanation
}

export interface ContentHealthResult {
  overallScore: number; // 0–100
  overallLabel: string;
  dimensions: ContentHealthDimension[];
  recommendations: string[];
}

export interface ContentHealthInput {
  /** Number of distinct content categories used in the period */
  distinctCategories: number;
  /** Total posts in the period */
  totalPosts: number;
  /** Number of active social accounts the user has */
  activeAccounts: number;
  /** Number of distinct accounts that received a publish in the period */
  accountsPostedTo: number;
  /** Consistency score 0-100 from the consistency utility */
  consistencyScore: number;
  /** Avg engagement (likes+comments+shares) in current period */
  currentEngagement: number;
  /** Avg engagement in the prior equal-length period (null = no data) */
  priorEngagement: number | null;
  /** Number of posts that were recycled (created via recycle endpoint) */
  recycledPosts: number;
}

function dimensionLabel(score: number, max: number): string {
  const pct = max > 0 ? score / max : 0;
  if (pct >= 0.85) return "Excellent";
  if (pct >= 0.65) return "Good";
  if (pct >= 0.4) return "Fair";
  return "Poor";
}

export function computeContentHealth(input: ContentHealthInput): ContentHealthResult {
  const {
    distinctCategories,
    totalPosts,
    activeAccounts,
    accountsPostedTo,
    consistencyScore,
    currentEngagement,
    priorEngagement,
    recycledPosts,
  } = input;

  const dimensions: ContentHealthDimension[] = [];
  const recommendations: string[] = [];

  // ── 1. Diversity (30 pts) ─────────────────────────────────────────────────
  // Score full marks at ≥5 distinct categories; scale linearly below that.
  const MAX_DIVERSITY = 30;
  const diversityRaw = Math.min(distinctCategories / 5, 1) * MAX_DIVERSITY;
  const diversityScore = Math.round(diversityRaw);
  dimensions.push({
    name: "Content Diversity",
    score: diversityScore,
    max: MAX_DIVERSITY,
    label: dimensionLabel(diversityScore, MAX_DIVERSITY),
    detail: `${distinctCategories} distinct content ${distinctCategories === 1 ? "category" : "categories"} used in this period.`,
  });
  if (distinctCategories < 3) {
    recommendations.push("Mix in more content categories (e.g., Educational, Entertaining, Engaging) to reach wider audiences.");
  }

  // ── 2. Platform Coverage (20 pts) ─────────────────────────────────────────
  const MAX_COVERAGE = 20;
  let coverageScore = MAX_COVERAGE;
  if (activeAccounts > 0) {
    coverageScore = Math.round((accountsPostedTo / activeAccounts) * MAX_COVERAGE);
  }
  dimensions.push({
    name: "Platform Coverage",
    score: coverageScore,
    max: MAX_COVERAGE,
    label: dimensionLabel(coverageScore, MAX_COVERAGE),
    detail:
      activeAccounts === 0
        ? "No social accounts connected."
        : `Posted to ${accountsPostedTo} of ${activeAccounts} connected account${activeAccounts !== 1 ? "s" : ""}.`,
  });
  if (activeAccounts > 0 && accountsPostedTo < activeAccounts) {
    recommendations.push(`You have ${activeAccounts - accountsPostedTo} connected account${activeAccounts - accountsPostedTo !== 1 ? "s" : ""} that received no posts — spread your content further.`);
  }

  // ── 3. Regularity (20 pts) ────────────────────────────────────────────────
  const MAX_REGULARITY = 20;
  const regularityScore = Math.round((consistencyScore / 100) * MAX_REGULARITY);
  dimensions.push({
    name: "Posting Regularity",
    score: regularityScore,
    max: MAX_REGULARITY,
    label: dimensionLabel(regularityScore, MAX_REGULARITY),
    detail: `Consistency score: ${consistencyScore}/100.`,
  });
  if (consistencyScore < 50) {
    recommendations.push("Post more consistently — aim for at least one post per week to maintain audience engagement.");
  }

  // ── 4. Engagement Trend (20 pts) ─────────────────────────────────────────
  const MAX_TREND = 20;
  let trendScore = MAX_TREND / 2; // neutral when no prior data
  let trendDetail = "No prior period data available for comparison.";
  if (priorEngagement !== null && priorEngagement > 0) {
    const ratio = currentEngagement / priorEngagement;
    // Full marks at 1.5× or above, zero at 0.5× or below
    const clamped = Math.min(Math.max((ratio - 0.5) / 1.0, 0), 1);
    trendScore = Math.round(clamped * MAX_TREND);
    const pct = Math.round((ratio - 1) * 100);
    trendDetail =
      pct >= 0
        ? `Engagement is up ${pct}% vs the prior period.`
        : `Engagement is down ${Math.abs(pct)}% vs the prior period.`;
  } else if (priorEngagement === 0 && currentEngagement > 0) {
    trendScore = MAX_TREND;
    trendDetail = "First engagement data — great start!";
  }
  dimensions.push({
    name: "Engagement Trend",
    score: trendScore,
    max: MAX_TREND,
    label: dimensionLabel(trendScore, MAX_TREND),
    detail: trendDetail,
  });
  if (trendScore < MAX_TREND * 0.4) {
    recommendations.push("Engagement is declining — try different content formats, posting times, or add more interactive elements (questions, polls).");
  }

  // ── 5. Content Freshness (10 pts) ─────────────────────────────────────────
  const MAX_FRESHNESS = 10;
  let freshnessScore = MAX_FRESHNESS;
  let freshnessDetail = "All posts are original content.";
  if (totalPosts > 0) {
    const recycledPct = recycledPosts / totalPosts;
    // Full marks when ≤20% recycled; zero at 80%+ recycled
    const clamped = Math.min(Math.max(1 - (recycledPct - 0.2) / 0.6, 0), 1);
    freshnessScore = Math.round(clamped * MAX_FRESHNESS);
    if (recycledPosts === 0) {
      freshnessDetail = "All posts are original content.";
    } else {
      const pct = Math.round(recycledPct * 100);
      freshnessDetail = `${pct}% of posts are recycled content.`;
    }
  }
  dimensions.push({
    name: "Content Freshness",
    score: freshnessScore,
    max: MAX_FRESHNESS,
    label: dimensionLabel(freshnessScore, MAX_FRESHNESS),
    detail: freshnessDetail,
  });
  if (freshnessScore < MAX_FRESHNESS * 0.5) {
    recommendations.push("Over half your content is recycled — balance it with fresh posts to keep your audience engaged.");
  }

  // ── Overall score ──────────────────────────────────────────────────────────
  const overallScore = Math.min(
    100,
    Math.max(0, dimensions.reduce((sum, d) => sum + d.score, 0))
  );

  let overallLabel: string;
  if (overallScore >= 85) overallLabel = "Excellent";
  else if (overallScore >= 65) overallLabel = "Good";
  else if (overallScore >= 40) overallLabel = "Fair";
  else overallLabel = "Needs Attention";

  if (recommendations.length === 0) {
    recommendations.push("Great work! Keep maintaining your current content strategy.");
  }

  return { overallScore, overallLabel, dimensions, recommendations };
}
