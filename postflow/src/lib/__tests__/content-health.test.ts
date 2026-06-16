import { computeContentHealth, type ContentHealthInput } from "../content-health";

const base: ContentHealthInput = {
  distinctCategories: 5,
  totalPosts: 20,
  activeAccounts: 3,
  accountsPostedTo: 3,
  consistencyScore: 80,
  currentEngagement: 50,
  priorEngagement: 40,
  recycledPosts: 0,
};

describe("computeContentHealth", () => {
  it("returns an overall score between 0 and 100", () => {
    const result = computeContentHealth(base);
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
  });

  it("returns 5 dimensions", () => {
    const result = computeContentHealth(base);
    expect(result.dimensions).toHaveLength(5);
  });

  it("gives full diversity score for 5 categories", () => {
    const result = computeContentHealth(base);
    const div = result.dimensions.find((d) => d.name === "Content Diversity");
    expect(div?.score).toBe(div?.max); // 30/30
  });

  it("penalises diversity for < 3 categories with a recommendation", () => {
    const result = computeContentHealth({ ...base, distinctCategories: 1 });
    const recs = result.recommendations;
    expect(recs.some((r) => r.toLowerCase().includes("categor"))).toBe(true);
  });

  it("full platform coverage when all accounts posted to", () => {
    const result = computeContentHealth(base);
    const cov = result.dimensions.find((d) => d.name === "Platform Coverage");
    expect(cov?.score).toBe(cov?.max);
  });

  it("partial platform coverage when not all accounts used", () => {
    const result = computeContentHealth({ ...base, activeAccounts: 4, accountsPostedTo: 2 });
    const cov = result.dimensions.find((d) => d.name === "Platform Coverage");
    expect(cov!.score).toBeLessThan(cov!.max);
  });

  it("generates recommendation when accounts unused", () => {
    const result = computeContentHealth({ ...base, activeAccounts: 4, accountsPostedTo: 2 });
    expect(result.recommendations.some((r) => r.includes("connected account"))).toBe(true);
  });

  it("maps consistency score to regularity dimension", () => {
    const result = computeContentHealth({ ...base, consistencyScore: 100 });
    const reg = result.dimensions.find((d) => d.name === "Posting Regularity");
    expect(reg?.score).toBe(reg?.max);
  });

  it("engagement trend above-neutral when current > prior", () => {
    const result = computeContentHealth({ ...base, currentEngagement: 100, priorEngagement: 50 });
    const trend = result.dimensions.find((d) => d.name === "Engagement Trend");
    expect(trend!.score).toBeGreaterThan(trend!.max / 2);
  });

  it("engagement trend neutral when no prior data", () => {
    const result = computeContentHealth({ ...base, priorEngagement: null });
    const trend = result.dimensions.find((d) => d.name === "Engagement Trend");
    expect(trend?.score).toBe(Math.round(trend!.max / 2));
  });

  it("gives full freshness score when no recycled posts", () => {
    const result = computeContentHealth({ ...base, recycledPosts: 0, totalPosts: 10 });
    const fresh = result.dimensions.find((d) => d.name === "Content Freshness");
    expect(fresh?.score).toBe(fresh?.max);
  });

  it("reduces freshness score when many posts are recycled", () => {
    const result = computeContentHealth({ ...base, recycledPosts: 9, totalPosts: 10 });
    const fresh = result.dimensions.find((d) => d.name === "Content Freshness");
    expect(fresh!.score).toBeLessThan(fresh!.max);
  });

  it("labels Excellent when overall score >= 85", () => {
    const perfect: ContentHealthInput = {
      distinctCategories: 8,
      totalPosts: 30,
      activeAccounts: 2,
      accountsPostedTo: 2,
      consistencyScore: 100,
      currentEngagement: 200,
      priorEngagement: 50,
      recycledPosts: 0,
    };
    const result = computeContentHealth(perfect);
    expect(result.overallScore).toBeGreaterThanOrEqual(85);
    expect(result.overallLabel).toBe("Excellent");
  });

  it("labels Needs Attention when overall score < 40", () => {
    const poor: ContentHealthInput = {
      distinctCategories: 0,
      totalPosts: 0,
      activeAccounts: 5,
      accountsPostedTo: 0,
      consistencyScore: 0,
      currentEngagement: 0,
      priorEngagement: 100,
      recycledPosts: 0,
    };
    const result = computeContentHealth(poor);
    expect(result.overallLabel).toBe("Needs Attention");
  });
});
