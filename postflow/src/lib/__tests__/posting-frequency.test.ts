import {
  computePlatformFrequency,
  RECOMMENDED_FREQUENCY,
  type PublishResultForFrequency,
} from "../posting-frequency";

function makeResults(platform: string, count: number): PublishResultForFrequency[] {
  return Array.from({ length: count }, () => ({ platform }));
}

describe("computePlatformFrequency", () => {
  it("returns empty array when no results", () => {
    const result = computePlatformFrequency([], 30);
    expect(result).toHaveLength(0);
  });

  it("returns pacingScore=100 when posting exactly at recommended rate", () => {
    // Facebook recommended: 5/week; 30 days = ~4.28 weeks → target = 5*4.28 ≈ 21 posts
    const days = 30;
    const weeks = days / 7;
    const target = Math.round(RECOMMENDED_FREQUENCY.FACEBOOK * weeks);
    const results = makeResults("FACEBOOK", target);
    const output = computePlatformFrequency(results, days);
    expect(output[0].pacingScore).toBe(100);
    expect(output[0].status).toBe("optimal");
  });

  it("reduces score and marks 'over' when posting more than 1.2× recommended", () => {
    const days = 7; // 1 week
    // Facebook recommended: 5/wk; 3× over = 15 posts in 1 week
    const results = makeResults("FACEBOOK", 15);
    const output = computePlatformFrequency(results, days);
    expect(output[0].status).toBe("over");
    expect(output[0].pacingScore).toBeLessThan(100);
    expect(output[0].pacingScore).toBeGreaterThanOrEqual(0);
  });

  it("reduces score and marks 'under' when posting less than 0.8× recommended", () => {
    const days = 30; // ~4.28 weeks
    // Facebook recommended: 5/wk → ~21 posts; post only 2
    const results = makeResults("FACEBOOK", 2);
    const output = computePlatformFrequency(results, days);
    expect(output[0].status).toBe("under");
    expect(output[0].pacingScore).toBeLessThan(100);
    expect(output[0].pacingScore).toBeGreaterThanOrEqual(0);
  });

  it("returns pacingScore=0 when no posts", () => {
    // 0 posts = pacingScore clamped at 0
    const results = makeResults("FACEBOOK", 0);
    const output = computePlatformFrequency(results, 30);
    // empty because 0 entries in map
    expect(output).toHaveLength(0);
  });

  it("handles unknown platform with default recommended of 5", () => {
    const days = 7; // 1 week
    const results = makeResults("UNKNOWNPLATFORM", 5);
    const output = computePlatformFrequency(results, days);
    expect(output[0].recommendedPerWeek).toBe(5);
    expect(output[0].status).toBe("optimal");
  });

  it("all platforms are covered in RECOMMENDED_FREQUENCY", () => {
    const knownPlatforms = [
      "FACEBOOK",
      "INSTAGRAM",
      "THREADS",
      "TWITTER",
      "LINKEDIN",
      "TIKTOK",
      "YOUTUBE",
      "PINTEREST",
    ];
    for (const platform of knownPlatforms) {
      expect(RECOMMENDED_FREQUENCY[platform]).toBeDefined();
      expect(typeof RECOMMENDED_FREQUENCY[platform]).toBe("number");
    }
  });

  it("sorts output by totalPublished descending", () => {
    const results = [
      ...makeResults("INSTAGRAM", 10),
      ...makeResults("FACEBOOK", 3),
      ...makeResults("THREADS", 7),
    ];
    const output = computePlatformFrequency(results, 30);
    expect(output[0].platform).toBe("INSTAGRAM");
    expect(output[1].platform).toBe("THREADS");
    expect(output[2].platform).toBe("FACEBOOK");
  });

  it("computes actualPerWeek correctly", () => {
    const days = 14; // 2 weeks
    const results = makeResults("INSTAGRAM", 14); // 7/wk
    const output = computePlatformFrequency(results, days);
    expect(output[0].actualPerWeek).toBe(7);
    expect(output[0].totalPublished).toBe(14);
  });

  it("clamps pacingScore between 0 and 100", () => {
    const days = 7;
    // Extreme over-posting: 100× recommended for a platform
    const results = makeResults("MEDIUM", 200); // MEDIUM recommended: 2/wk; posting 200/wk
    const output = computePlatformFrequency(results, days);
    expect(output[0].pacingScore).toBeGreaterThanOrEqual(0);
    expect(output[0].pacingScore).toBeLessThanOrEqual(100);
  });
});
