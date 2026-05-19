jest.mock("@prisma/client", () => ({
  Platform: {
    FACEBOOK: "FACEBOOK",
    INSTAGRAM: "INSTAGRAM",
    THREADS: "THREADS",
    TWITTER: "TWITTER",
    TIKTOK: "TIKTOK",
  },
}));

import {
  computePerformance,
  computeBenchmarkComparisons,
  PLATFORM_BENCHMARKS,
  type PlatformBenchmark,
} from "@/lib/engagement-benchmarks";

type Platform = "FACEBOOK" | "INSTAGRAM" | "THREADS" | "TWITTER" | "TIKTOK";

// ── computePerformance ────────────────────────────────────────────────────────

describe("computePerformance", () => {
  const fbBenchmark: PlatformBenchmark = {
    engagementRate: 0.64,
    source: "test",
  };

  it("returns 'above' when user rate is more than 5% above benchmark", () => {
    const { performance, diffPct } = computePerformance(0.7, fbBenchmark);
    expect(performance).toBe("above");
    expect(diffPct).toBeGreaterThan(0);
  });

  it("returns 'at' when user rate is within 5% of benchmark", () => {
    const { performance } = computePerformance(0.64, fbBenchmark);
    expect(performance).toBe("at");
  });

  it("returns 'below' when user rate is more than 5% below benchmark", () => {
    const { performance, diffPct } = computePerformance(0.1, fbBenchmark);
    expect(performance).toBe("below");
    expect(diffPct).toBeLessThan(0);
  });

  it("returns 'insufficient' when benchmark is null", () => {
    const { performance, diffPct } = computePerformance(1.0, null);
    expect(performance).toBe("insufficient");
    expect(diffPct).toBeNull();
  });

  it("computes diffPct correctly: 5% rate vs 0.64% = +681%", () => {
    const { diffPct } = computePerformance(5.0, fbBenchmark);
    expect(diffPct).toBeCloseTo(((5.0 - 0.64) / 0.64) * 100, 0);
  });
});

// ── computeBenchmarkComparisons ───────────────────────────────────────────────

describe("computeBenchmarkComparisons", () => {
  it("returns empty array when no rows provided", () => {
    const result = computeBenchmarkComparisons([]);
    expect(result).toHaveLength(0);
  });

  it("returns empty array when all rows have null insights", () => {
    const rows = [
      { platform: "FACEBOOK" as Platform, insights: null },
      { platform: "FACEBOOK" as Platform, insights: null },
    ];
    const result = computeBenchmarkComparisons(rows as never);
    expect(result).toHaveLength(0);
  });

  it("aggregates totals correctly across multiple posts", () => {
    const rows = [
      {
        platform: "FACEBOOK" as Platform,
        insights: { impressions: 1000, reach: 800, likes: 40, comments: 8, shares: 4 },
      },
      {
        platform: "FACEBOOK" as Platform,
        insights: { impressions: 2000, reach: 1600, likes: 80, comments: 16, shares: 8 },
      },
      {
        platform: "FACEBOOK" as Platform,
        insights: { impressions: 1500, reach: 1200, likes: 60, comments: 12, shares: 6 },
      },
    ];
    const result = computeBenchmarkComparisons(rows as never);
    const fb = result.find((c) => c.platform === "FACEBOOK");
    expect(fb).toBeDefined();
    expect(fb!.userMetrics.impressions).toBe(4500);
    expect(fb!.userMetrics.reach).toBe(3600);
    expect(fb!.userMetrics.likes).toBe(180);
    expect(fb!.userMetrics.postCount).toBe(3);
  });

  it("computes avgEngagementRate as (likes+comments+shares)/reach*100", () => {
    const rows = Array.from({ length: 4 }, () => ({
      platform: "FACEBOOK" as Platform,
      insights: { impressions: 0, reach: 1000, likes: 10, comments: 2, shares: 1 },
    }));
    const result = computeBenchmarkComparisons(rows as never);
    const fb = result.find((c) => c.platform === "FACEBOOK");
    // (10+2+1)/1000 * 100 = 1.3% per post; aggregated: 52/4000*100 = 1.3%
    expect(fb!.userMetrics.avgEngagementRate).toBeCloseTo(1.3, 5);
  });

  it("marks performance as 'insufficient' when postCount < 3", () => {
    const rows = [
      {
        platform: "FACEBOOK" as Platform,
        insights: { impressions: 100, reach: 100, likes: 5, comments: 1, shares: 0 },
      },
      {
        platform: "FACEBOOK" as Platform,
        insights: { impressions: 200, reach: 200, likes: 10, comments: 2, shares: 1 },
      },
    ];
    const result = computeBenchmarkComparisons(rows as never);
    const fb = result.find((c) => c.platform === "FACEBOOK");
    expect(fb!.performance).toBe("insufficient");
    expect(fb!.diffPct).toBeNull();
  });

  it("includes benchmark data for known platforms", () => {
    const rows = Array.from({ length: 4 }, () => ({
      platform: "INSTAGRAM" as Platform,
      insights: { impressions: 500, reach: 400, likes: 15, comments: 3, shares: 1 },
    }));
    const result = computeBenchmarkComparisons(rows as never);
    const ig = result.find((c) => c.platform === "INSTAGRAM");
    expect(ig!.benchmark).not.toBeNull();
    expect(ig!.benchmark!.engagementRate).toBe(PLATFORM_BENCHMARKS.INSTAGRAM!.engagementRate);
  });

  it("returns null benchmark for unknown platforms", () => {
    const rows = Array.from({ length: 4 }, () => ({
      platform: "DEVTO" as Platform,
      insights: { impressions: 100, reach: 80, likes: 5, comments: 1, shares: 0 },
    }));
    const result = computeBenchmarkComparisons(rows as never);
    const devto = result.find((c) => c.platform === "DEVTO");
    expect(devto!.benchmark).toBeNull();
    expect(devto!.performance).toBe("insufficient"); // also < 3 postCount... wait no, 4 rows
    // Actually since benchmark is null, should be "insufficient" when no benchmark
    // Let's check: computePerformance is called only when count >= 3, and when benchmark is null it returns "insufficient"
    expect(devto!.performance).toBe("insufficient");
  });

  it("handles zero reach without dividing by zero", () => {
    const rows = Array.from({ length: 4 }, () => ({
      platform: "FACEBOOK" as Platform,
      insights: { impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0 },
    }));
    const result = computeBenchmarkComparisons(rows as never);
    const fb = result.find((c) => c.platform === "FACEBOOK");
    expect(fb!.userMetrics.avgEngagementRate).toBe(0);
    expect(fb!.performance).toBe("below"); // 0% < 0.64%
  });

  it("sorts results by postCount descending", () => {
    const rows = [
      ...Array.from({ length: 2 }, () => ({
        platform: "INSTAGRAM" as Platform,
        insights: { impressions: 100, reach: 80, likes: 5, comments: 1, shares: 0 },
      })),
      ...Array.from({ length: 5 }, () => ({
        platform: "FACEBOOK" as Platform,
        insights: { impressions: 100, reach: 80, likes: 5, comments: 1, shares: 0 },
      })),
    ];
    const result = computeBenchmarkComparisons(rows as never);
    expect(result[0].platform).toBe("FACEBOOK");
    expect(result[0].userMetrics.postCount).toBe(5);
  });
});
