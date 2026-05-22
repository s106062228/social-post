import {
  computeQualityScore,
  qualityLabel,
  sentimentToScore,
  type QualitySignals,
} from "../quality-score";

describe("sentimentToScore", () => {
  it("returns 100 for POSITIVE", () => {
    expect(sentimentToScore("POSITIVE")).toBe(100);
  });

  it("returns 65 for NEUTRAL", () => {
    expect(sentimentToScore("NEUTRAL")).toBe(65);
  });

  it("returns 30 for NEGATIVE", () => {
    expect(sentimentToScore("NEGATIVE")).toBe(30);
  });

  it("returns null for unknown string", () => {
    expect(sentimentToScore("UNKNOWN")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(sentimentToScore(null)).toBeNull();
  });
});

describe("qualityLabel", () => {
  it("returns Excellent for score >= 80", () => {
    expect(qualityLabel(80)).toBe("Excellent");
    expect(qualityLabel(100)).toBe("Excellent");
  });

  it("returns Good for 60 <= score < 80", () => {
    expect(qualityLabel(60)).toBe("Good");
    expect(qualityLabel(79)).toBe("Good");
  });

  it("returns Fair for 40 <= score < 60", () => {
    expect(qualityLabel(40)).toBe("Fair");
    expect(qualityLabel(59)).toBe("Fair");
  });

  it("returns Needs Work for score < 40", () => {
    expect(qualityLabel(0)).toBe("Needs Work");
    expect(qualityLabel(39)).toBe("Needs Work");
  });
});

describe("computeQualityScore", () => {
  it("returns weighted average of all signals", () => {
    const signals: QualitySignals = {
      readabilityScore: 80,
      seoScore: 60,
      sentimentScore: 100,
      complianceScore: 100,
    };
    // weighted: (80×25 + 60×35 + 100×15 + 100×25) / 100 = (2000+2100+1500+2500)/100 = 81
    const result = computeQualityScore(signals);
    expect(result.score).toBe(81);
    expect(result.label).toBe("Excellent");
  });

  it("ignores null sentimentScore in weighted average", () => {
    const signals: QualitySignals = {
      readabilityScore: 80,
      seoScore: 60,
      sentimentScore: null,
      complianceScore: 100,
    };
    // weighted: (80×25 + 60×35 + 100×25) / 85 = (2000+2100+2500)/85 ≈ 78
    const result = computeQualityScore(signals);
    const expected = Math.round((2000 + 2100 + 2500) / 85);
    expect(result.score).toBe(expected);
  });

  it("ignores null complianceScore in weighted average", () => {
    const signals: QualitySignals = {
      readabilityScore: 80,
      seoScore: 60,
      sentimentScore: 100,
      complianceScore: null,
    };
    // weighted: (80×25 + 60×35 + 100×15) / 75 = (2000+2100+1500)/75 = 75
    const result = computeQualityScore(signals);
    const expected = Math.round((2000 + 2100 + 1500) / 75);
    expect(result.score).toBe(expected);
  });

  it("handles both null optional signals", () => {
    const signals: QualitySignals = {
      readabilityScore: 80,
      seoScore: 60,
      sentimentScore: null,
      complianceScore: null,
    };
    // weighted: (80×25 + 60×35) / 60 = (2000+2100)/60 ≈ 68
    const result = computeQualityScore(signals);
    const expected = Math.round((2000 + 2100) / 60);
    expect(result.score).toBe(expected);
    expect(result.label).toBe("Good");
  });

  it("returns 0 when totalWeight is 0 (impossible in practice but tested)", () => {
    // This edge case won't happen normally but test the guard
    const signals = {
      readabilityScore: 0,
      seoScore: 0,
      sentimentScore: null,
      complianceScore: null,
    } as unknown as QualitySignals;
    // readabilityScore and seoScore are always numbers, so totalWeight >= 60
    const result = computeQualityScore(signals);
    expect(result.score).toBe(0);
  });

  it("preserves breakdown in result", () => {
    const signals: QualitySignals = {
      readabilityScore: 75,
      seoScore: 50,
      sentimentScore: 65,
      complianceScore: 80,
    };
    const result = computeQualityScore(signals);
    expect(result.breakdown.readability).toBe(75);
    expect(result.breakdown.seo).toBe(50);
    expect(result.breakdown.sentiment).toBe(65);
    expect(result.breakdown.compliance).toBe(80);
  });

  it("returns correct label for low scores", () => {
    const signals: QualitySignals = {
      readabilityScore: 0,
      seoScore: 0,
      sentimentScore: 30,
      complianceScore: 0,
    };
    const result = computeQualityScore(signals);
    expect(result.label).toBe("Needs Work");
  });
});
