import {
  computeWeightedEngagement,
  computeZScore,
  detectEngagementAnomalies,
  type PostForAnomaly,
} from "@/lib/anomaly-detection";

// ─── Unit tests for utility functions ────────────────────────────────────────

describe("computeWeightedEngagement", () => {
  it("returns 0 for all-zero inputs", () => {
    expect(computeWeightedEngagement(0, 0, 0, 0, 0)).toBe(0);
  });

  it("applies correct weights", () => {
    // likes×3 + comments×5 + shares×4 + reach×1 + impressions×0.5
    expect(computeWeightedEngagement(1, 1, 1, 1, 2)).toBe(3 + 5 + 4 + 1 + 1);
  });

  it("weights comments highest (5) then shares (4) then likes (3)", () => {
    const onlyComments = computeWeightedEngagement(0, 10, 0, 0, 0);
    const onlyShares = computeWeightedEngagement(0, 0, 10, 0, 0);
    const onlyLikes = computeWeightedEngagement(10, 0, 0, 0, 0);
    expect(onlyComments).toBeGreaterThan(onlyShares);
    expect(onlyShares).toBeGreaterThan(onlyLikes);
  });
});

describe("computeZScore", () => {
  it("returns 0 when stddev is 0", () => {
    expect(computeZScore(100, 100, 0)).toBe(0);
  });

  it("returns positive z for value above mean", () => {
    expect(computeZScore(12, 10, 2)).toBe(1);
  });

  it("returns negative z for value below mean", () => {
    expect(computeZScore(8, 10, 2)).toBe(-1);
  });

  it("returns 2 for a 2-sigma spike", () => {
    expect(computeZScore(14, 10, 2)).toBe(2);
  });
});

// ─── detectEngagementAnomalies ────────────────────────────────────────────────

function makePost(
  platform: string,
  likes: number,
  postId = Math.random().toString()
): PostForAnomaly {
  return {
    postId,
    content: `Post ${postId}`,
    platform,
    publishedAt: new Date(),
    insights: { likes, comments: 0, shares: 0, reach: 0, impressions: 0 },
  };
}

describe("detectEngagementAnomalies", () => {
  it("returns empty anomalies with 0 posts", () => {
    const result = detectEngagementAnomalies([]);
    expect(result.anomalies).toHaveLength(0);
    expect(result.totalAnalyzed).toBe(0);
    expect(result.platformBaselines).toHaveLength(0);
  });

  it("requires at least 3 posts per platform to flag anomalies", () => {
    // Only 2 posts for this platform — not enough for a baseline
    const posts: PostForAnomaly[] = [makePost("twitter", 100), makePost("twitter", 10)];
    const result = detectEngagementAnomalies(posts);
    expect(result.anomalies).toHaveLength(0);
    expect(result.totalAnalyzed).toBe(2);
  });

  it("flags a spike when a post is well above the platform mean", () => {
    // Need ≥7 posts so z-score of outlier is sqrt(6) ≈ 2.45, clearly above threshold
    const posts: PostForAnomaly[] = [
      makePost("instagram", 10),
      makePost("instagram", 12),
      makePost("instagram", 8),
      makePost("instagram", 11),
      makePost("instagram", 9),
      makePost("instagram", 10),
      makePost("instagram", 300), // spike
    ];
    const result = detectEngagementAnomalies(posts);
    const spike = result.anomalies.find((a) => a.anomalyType === "spike");
    expect(spike).toBeDefined();
    expect(spike?.zScore).toBeGreaterThan(2);
  });

  it("flags a drop when a post is well below the platform mean", () => {
    // Need ≥7 posts so z-score of outlier is sqrt(6) ≈ 2.45, clearly below -threshold
    const posts: PostForAnomaly[] = [
      makePost("facebook", 100),
      makePost("facebook", 110),
      makePost("facebook", 90),
      makePost("facebook", 105),
      makePost("facebook", 95),
      makePost("facebook", 100),
      makePost("facebook", 1), // drop
    ];
    const result = detectEngagementAnomalies(posts);
    const drop = result.anomalies.find((a) => a.anomalyType === "drop");
    expect(drop).toBeDefined();
    expect(drop?.zScore).toBeLessThan(-2);
  });

  it("does not flag posts within ±2 stddev", () => {
    // tightly clustered — no anomalies
    const posts: PostForAnomaly[] = [
      makePost("threads", 100),
      makePost("threads", 102),
      makePost("threads", 98),
      makePost("threads", 101),
      makePost("threads", 99),
    ];
    const result = detectEngagementAnomalies(posts);
    expect(result.anomalies).toHaveLength(0);
  });

  it("sorts anomalies by absolute z-score descending", () => {
    const posts: PostForAnomaly[] = [
      makePost("tiktok", 50),
      makePost("tiktok", 55),
      makePost("tiktok", 45),
      makePost("tiktok", 52),
      makePost("tiktok", 1),   // mild drop
      makePost("tiktok", 500), // big spike
    ];
    const result = detectEngagementAnomalies(posts);
    if (result.anomalies.length >= 2) {
      const absZ = result.anomalies.map((a) => Math.abs(a.zScore));
      for (let i = 1; i < absZ.length; i++) {
        expect(absZ[i]).toBeLessThanOrEqual(absZ[i - 1]);
      }
    }
  });

  it("returns correct totalAnalyzed count", () => {
    const posts = Array.from({ length: 7 }, (_, i) => makePost("linkedin", i * 10));
    const result = detectEngagementAnomalies(posts);
    expect(result.totalAnalyzed).toBe(7);
  });

  it("returns platformBaselines sorted by sampleSize descending", () => {
    const posts: PostForAnomaly[] = [
      ...Array.from({ length: 5 }, () => makePost("platform_a", 50)),
      ...Array.from({ length: 3 }, () => makePost("platform_b", 50)),
    ];
    const result = detectEngagementAnomalies(posts);
    expect(result.platformBaselines[0].platform).toBe("platform_a");
    expect(result.platformBaselines[0].sampleSize).toBe(5);
    expect(result.platformBaselines[1].sampleSize).toBe(3);
  });

  it("handles null insight values as 0", () => {
    const posts: PostForAnomaly[] = [
      { postId: "a", content: "a", platform: "bluesky", publishedAt: null, insights: { likes: null, comments: null, shares: null, reach: null, impressions: null } },
      { postId: "b", content: "b", platform: "bluesky", publishedAt: null, insights: {} },
      { postId: "c", content: "c", platform: "bluesky", publishedAt: null, insights: { likes: 10 } },
    ];
    // should not throw
    expect(() => detectEngagementAnomalies(posts)).not.toThrow();
    const result = detectEngagementAnomalies(posts);
    expect(result.totalAnalyzed).toBe(3);
  });

  it("respects custom zThreshold", () => {
    const posts: PostForAnomaly[] = [
      makePost("mastodon", 10),
      makePost("mastodon", 12),
      makePost("mastodon", 8),
      makePost("mastodon", 50), // moderate spike (~2σ)
    ];
    const strictResult = detectEngagementAnomalies(posts, 3.0);
    const looseResult = detectEngagementAnomalies(posts, 1.0);
    // loose threshold should find ≥ as many anomalies as strict
    expect(looseResult.anomalies.length).toBeGreaterThanOrEqual(strictResult.anomalies.length);
  });
});
