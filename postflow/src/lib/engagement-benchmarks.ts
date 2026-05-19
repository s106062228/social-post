import type { Platform } from "@prisma/client";

export type PerformanceLabel = "above" | "at" | "below" | "insufficient";

export interface PlatformBenchmark {
  engagementRate: number; // percentage (e.g. 1.22 means 1.22%)
  source: string;
}

export interface UserPlatformMetrics {
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  postCount: number;
  avgEngagementRate: number; // (likes+comments+shares)/reach * 100
}

export interface BenchmarkComparison {
  platform: Platform;
  userMetrics: UserPlatformMetrics;
  benchmark: PlatformBenchmark | null;
  performance: PerformanceLabel;
  diffPct: number | null; // positive = above, negative = below
}

// Industry-average engagement rates sourced from publicly available reports.
// Engagement rate = (likes + comments + shares) / reach * 100.
export const PLATFORM_BENCHMARKS: Partial<Record<Platform, PlatformBenchmark>> = {
  FACEBOOK: {
    engagementRate: 0.64,
    source: "Rival IQ Social Media Industry Benchmark 2024",
  },
  INSTAGRAM: {
    engagementRate: 1.22,
    source: "Rival IQ Social Media Industry Benchmark 2024",
  },
  THREADS: {
    engagementRate: 0.5,
    source: "Estimated (emerging platform)",
  },
  TWITTER: {
    engagementRate: 0.04,
    source: "Rival IQ Social Media Industry Benchmark 2024",
  },
  LINKEDIN: {
    engagementRate: 0.35,
    source: "Hootsuite Social Trends 2024",
  },
  TIKTOK: {
    engagementRate: 5.53,
    source: "Rival IQ Social Media Industry Benchmark 2024",
  },
  YOUTUBE: {
    engagementRate: 2.0,
    source: "Estimated industry average",
  },
  PINTEREST: {
    engagementRate: 0.35,
    source: "Estimated industry average",
  },
  BLUESKY: {
    engagementRate: 0.5,
    source: "Estimated (emerging platform)",
  },
  MASTODON: {
    engagementRate: 0.5,
    source: "Estimated industry average",
  },
  REDDIT: {
    engagementRate: 2.0,
    source: "Estimated industry average",
  },
  TELEGRAM: {
    engagementRate: 5.0,
    source: "Estimated (high-engagement channel format)",
  },
};

export function computePerformance(
  userRate: number,
  benchmark: PlatformBenchmark | null
): { performance: PerformanceLabel; diffPct: number | null } {
  if (!benchmark) return { performance: "insufficient", diffPct: null };
  const diff = userRate - benchmark.engagementRate;
  const diffPct = benchmark.engagementRate > 0
    ? (diff / benchmark.engagementRate) * 100
    : 0;

  let performance: PerformanceLabel;
  if (userRate >= benchmark.engagementRate * 1.05) {
    performance = "above";
  } else if (userRate <= benchmark.engagementRate * 0.95) {
    performance = "below";
  } else {
    performance = "at";
  }
  return { performance, diffPct };
}

interface InsightRow {
  platform: Platform;
  insights: {
    impressions: number | null;
    reach: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
  } | null;
}

export function computeBenchmarkComparisons(
  rows: InsightRow[]
): BenchmarkComparison[] {
  const byPlatform = new Map<
    Platform,
    {
      impressions: number;
      reach: number;
      likes: number;
      comments: number;
      shares: number;
      count: number;
    }
  >();

  for (const row of rows) {
    if (!row.insights) continue;
    const { impressions = 0, reach = 0, likes = 0, comments = 0, shares = 0 } =
      row.insights;

    const existing = byPlatform.get(row.platform) ?? {
      impressions: 0,
      reach: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      count: 0,
    };
    byPlatform.set(row.platform, {
      impressions: existing.impressions + (impressions ?? 0),
      reach: existing.reach + (reach ?? 0),
      likes: existing.likes + (likes ?? 0),
      comments: existing.comments + (comments ?? 0),
      shares: existing.shares + (shares ?? 0),
      count: existing.count + 1,
    });
  }

  const results: BenchmarkComparison[] = [];

  for (const [platform, agg] of byPlatform.entries()) {
    const avgEngagementRate =
      agg.reach > 0
        ? ((agg.likes + agg.comments + agg.shares) / agg.reach) * 100
        : 0;

    const userMetrics: UserPlatformMetrics = {
      impressions: agg.impressions,
      reach: agg.reach,
      likes: agg.likes,
      comments: agg.comments,
      shares: agg.shares,
      postCount: agg.count,
      avgEngagementRate,
    };

    const benchmark = PLATFORM_BENCHMARKS[platform] ?? null;
    const { performance, diffPct } =
      agg.count < 3
        ? { performance: "insufficient" as PerformanceLabel, diffPct: null }
        : computePerformance(avgEngagementRate, benchmark);

    results.push({ platform, userMetrics, benchmark, performance, diffPct });
  }

  results.sort((a, b) => b.userMetrics.postCount - a.userMetrics.postCount);
  return results;
}
