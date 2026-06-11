import { computeSeasonalPatterns } from "@/lib/seasonal-patterns";

function makePost(
  id: string,
  month: number,
  year = 2025,
  engagement = 0
) {
  return {
    id,
    content: `Post content ${id}`,
    engagement,
    publishedAt: new Date(year, month - 1, 15), // 15th of each month
  };
}

// ── computeSeasonalPatterns ───────────────────────────────────────────────────

describe("computeSeasonalPatterns", () => {
  // ── Empty input ──────────────────────────────────────────────────────────

  it("returns empty result for empty posts array", () => {
    const result = computeSeasonalPatterns([]);
    expect(result.patterns).toHaveLength(0);
    expect(result.totalPosts).toBe(0);
    expect(result.bestMonth).toBeNull();
    expect(result.worstMonth).toBeNull();
  });

  // ── Single month ─────────────────────────────────────────────────────────

  it("returns 12 patterns with only one non-zero month", () => {
    const result = computeSeasonalPatterns([
      makePost("1", 3, 2025, 100),
      makePost("2", 3, 2025, 200),
    ]);
    expect(result.patterns).toHaveLength(12);
    const march = result.patterns.find((p) => p.month === 3)!;
    expect(march.postCount).toBe(2);
    expect(march.monthName).toBe("March");
  });

  // ── avgEngagement calculation ─────────────────────────────────────────────

  it("correctly calculates avgEngagement per month", () => {
    const result = computeSeasonalPatterns([
      makePost("a", 6, 2025, 100),
      makePost("b", 6, 2025, 200),
      makePost("c", 6, 2025, 300),
    ]);
    const june = result.patterns.find((p) => p.month === 6)!;
    expect(june.avgEngagement).toBe(200); // (100+200+300)/3
    expect(june.totalEngagement).toBe(600);
    expect(june.postCount).toBe(3);
  });

  // ── bestMonth / worstMonth selection ─────────────────────────────────────

  it("sets bestMonth to month with highest avgEngagement", () => {
    const result = computeSeasonalPatterns([
      makePost("1", 1, 2025, 10),
      makePost("2", 6, 2025, 500),
      makePost("3", 12, 2025, 50),
    ]);
    expect(result.bestMonth).toBe(6);
  });

  it("sets worstMonth to month with lowest avgEngagement among months with posts", () => {
    const result = computeSeasonalPatterns([
      makePost("1", 1, 2025, 10),
      makePost("2", 6, 2025, 500),
      makePost("3", 12, 2025, 50),
    ]);
    // Month 1 has avg 10 which is the lowest among months with posts
    expect(result.worstMonth).toBe(1);
  });

  it("returns null bestMonth and worstMonth when no posts", () => {
    const result = computeSeasonalPatterns([]);
    expect(result.bestMonth).toBeNull();
    expect(result.worstMonth).toBeNull();
  });

  // ── topPosts capped at 5 ──────────────────────────────────────────────────

  it("caps topPosts at 5 per month", () => {
    const posts = Array.from({ length: 8 }, (_, i) =>
      makePost(`p${i}`, 4, 2025, (i + 1) * 10)
    );
    const result = computeSeasonalPatterns(posts);
    const april = result.patterns.find((p) => p.month === 4)!;
    expect(april.topPosts.length).toBeLessThanOrEqual(5);
  });

  // ── month range 1–12 ──────────────────────────────────────────────────────

  it("generates patterns for all 12 months", () => {
    const result = computeSeasonalPatterns([makePost("1", 7, 2025, 100)]);
    expect(result.patterns).toHaveLength(12);
    const months = result.patterns.map((p) => p.month);
    for (let m = 1; m <= 12; m++) {
      expect(months).toContain(m);
    }
  });

  // ── totalPosts ────────────────────────────────────────────────────────────

  it("correctly counts totalPosts across all months", () => {
    const result = computeSeasonalPatterns([
      makePost("1", 1, 2025, 10),
      makePost("2", 2, 2025, 20),
      makePost("3", 3, 2025, 30),
    ]);
    expect(result.totalPosts).toBe(3);
  });
});
