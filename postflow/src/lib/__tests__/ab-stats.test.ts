import { computeABStats } from "@/lib/ab-stats";

describe("computeABStats", () => {
  const zero = { impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0 };

  it("returns zeroed result when both sides have no impressions", () => {
    const result = computeABStats(zero, zero);
    expect(result.rateA).toBe(0);
    expect(result.rateB).toBe(0);
    expect(result.zScore).toBe(0);
    expect(result.pValue).toBe(1);
    expect(result.isSignificant).toBe(false);
    expect(result.winnerLead).toBe("INCONCLUSIVE");
    expect(result.hasSufficientData).toBe(false);
  });

  it("marks hasSufficientData true only when both sides have ≥100 impressions", () => {
    const a = { impressions: 100, reach: 50, likes: 5, comments: 1, shares: 1 };
    const b = { impressions: 100, reach: 50, likes: 3, comments: 1, shares: 0 };
    const result = computeABStats(a, b);
    expect(result.hasSufficientData).toBe(true);
  });

  it("marks hasSufficientData false when one side has fewer than 100 impressions", () => {
    const a = { impressions: 50, reach: 25, likes: 5, comments: 1, shares: 0 };
    const b = { impressions: 200, reach: 100, likes: 10, comments: 2, shares: 1 };
    const result = computeABStats(a, b);
    expect(result.hasSufficientData).toBe(false);
  });

  it("detects Variant A as winner when rate A is higher", () => {
    const a = { impressions: 1000, reach: 900, likes: 50, comments: 10, shares: 5 };
    const b = { impressions: 1000, reach: 900, likes: 5, comments: 1, shares: 0 };
    const result = computeABStats(a, b);
    expect(result.winnerLead).toBe("A");
    expect(result.rateA).toBeGreaterThan(result.rateB);
  });

  it("detects Variant B as winner when rate B is higher", () => {
    const a = { impressions: 1000, reach: 900, likes: 5, comments: 1, shares: 0 };
    const b = { impressions: 1000, reach: 900, likes: 50, comments: 10, shares: 5 };
    const result = computeABStats(a, b);
    expect(result.winnerLead).toBe("B");
    expect(result.rateB).toBeGreaterThan(result.rateA);
  });

  it("returns INCONCLUSIVE when both sides have equal rates", () => {
    const a = { impressions: 1000, reach: 900, likes: 10, comments: 2, shares: 1 };
    const b = { impressions: 1000, reach: 900, likes: 10, comments: 2, shares: 1 };
    const result = computeABStats(a, b);
    expect(result.winnerLead).toBe("INCONCLUSIVE");
    expect(result.zScore).toBe(0);
  });

  it("achieves 95% confidence with a large effect between groups", () => {
    const a = { impressions: 2000, reach: 1800, likes: 200, comments: 40, shares: 20 };
    const b = { impressions: 2000, reach: 1800, likes: 10, comments: 2, shares: 1 };
    const result = computeABStats(a, b);
    expect(result.confidenceLevel).toBeGreaterThanOrEqual(95);
    expect(result.isSignificant).toBe(true);
  });

  it("is not significant when sample sizes are small and rates differ slightly", () => {
    const a = { impressions: 30, reach: 25, likes: 3, comments: 0, shares: 0 };
    const b = { impressions: 30, reach: 25, likes: 2, comments: 0, shares: 0 };
    const result = computeABStats(a, b);
    expect(result.isSignificant).toBe(false);
    expect(result.hasSufficientData).toBe(false);
  });

  it("computes effect size as relative percentage difference", () => {
    const a = { impressions: 1000, reach: 900, likes: 100, comments: 10, shares: 5 };
    const b = { impressions: 1000, reach: 900, likes: 50, comments: 5, shares: 2 };
    const result = computeABStats(a, b);
    expect(result.effect).toBeGreaterThan(0);
    expect(result.effect).toBeCloseTo(
      ((result.rateA - result.rateB) / result.rateB) * 100,
      1
    );
  });

  it("returns pValue between 0 and 1", () => {
    const a = { impressions: 500, reach: 450, likes: 30, comments: 5, shares: 2 };
    const b = { impressions: 500, reach: 450, likes: 15, comments: 3, shares: 1 };
    const result = computeABStats(a, b);
    expect(result.pValue).toBeGreaterThanOrEqual(0);
    expect(result.pValue).toBeLessThanOrEqual(1);
  });

  it("sets confidenceLevel to 0 when there is no significant difference", () => {
    const a = { impressions: 100, reach: 90, likes: 5, comments: 1, shares: 0 };
    const b = { impressions: 100, reach: 90, likes: 5, comments: 1, shares: 0 };
    const result = computeABStats(a, b);
    expect(result.confidenceLevel).toBe(0);
  });

  it("rateA is 0 when impressionsA is 0 but B has data", () => {
    const a = { impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0 };
    const b = { impressions: 500, reach: 400, likes: 20, comments: 4, shares: 2 };
    const result = computeABStats(a, b);
    expect(result.rateA).toBe(0);
    expect(result.rateB).toBeGreaterThan(0);
  });
});
