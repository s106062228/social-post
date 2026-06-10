import {
  computeProfileScore,
  type ProfileOptimizerInput,
} from "../profile-optimizer";

const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;

function makeInput(overrides: Partial<ProfileOptimizerInput> = {}): ProfileOptimizerInput {
  return {
    platform: "INSTAGRAM",
    postsLast90d: 28, // ~2/week vs recommended 7/week → ~29% ratio → low activity
    publishedTimestamps: [],
    avgEngagementRate: 1.5, // slightly above IG benchmark (1.22%)
    followerCounts: [],
    ...overrides,
  };
}

describe("computeProfileScore", () => {
  test("returns all required fields", () => {
    const result = computeProfileScore(makeInput());
    expect(result).toHaveProperty("overallScore");
    expect(result).toHaveProperty("grade");
    expect(result).toHaveProperty("dimensions");
    expect(result).toHaveProperty("tips");
    expect(result.dimensions).toHaveLength(4);
  });

  test("overallScore is between 0 and 100", () => {
    const result = computeProfileScore(makeInput());
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
  });

  test("grade A when score >= 90", () => {
    // Simulate perfect conditions: exactly at recommended freq, high engagement, good growth, consistent
    const timestamps = Array.from({ length: 91 }, (_, i) => NOW - (90 - i) * DAY);
    const result = computeProfileScore(
      makeInput({
        platform: "FACEBOOK",
        postsLast90d: 65, // 5/week = exactly recommended
        publishedTimestamps: timestamps,
        avgEngagementRate: 5, // well above benchmark
        followerCounts: [
          { syncedAt: NOW - 90 * DAY, followersCount: 1000 },
          { syncedAt: NOW, followersCount: 1100 }, // +10% growth
        ],
      })
    );
    expect(result.grade).toBe("A");
  });

  test("grade F when score < 40", () => {
    const result = computeProfileScore(
      makeInput({
        postsLast90d: 0,
        avgEngagementRate: 0,
        followerCounts: [
          { syncedAt: NOW - 90 * DAY, followersCount: 1000 },
          { syncedAt: NOW, followersCount: 900 }, // declining
        ],
      })
    );
    expect(result.grade).toBe("F");
  });

  test("activity score 25 when at recommended pace", () => {
    // INSTAGRAM: 7/week → 91 posts/90d
    const result = computeProfileScore(
      makeInput({ platform: "INSTAGRAM", postsLast90d: 91 })
    );
    const activity = result.dimensions.find((d) => d.name === "Activity")!;
    expect(activity.score).toBe(25);
  });

  test("activity score 0 when no posts", () => {
    const result = computeProfileScore(makeInput({ postsLast90d: 0 }));
    const activity = result.dimensions.find((d) => d.name === "Activity")!;
    expect(activity.score).toBe(0);
  });

  test("engagement score 25 when well above benchmark", () => {
    // FACEBOOK benchmark is 0.64%; 5% is well above
    const result = computeProfileScore(
      makeInput({ platform: "FACEBOOK", avgEngagementRate: 5 })
    );
    const eng = result.dimensions.find((d) => d.name === "Engagement")!;
    expect(eng.score).toBe(25);
  });

  test("growth score is 25 with strong follower growth (>=5%)", () => {
    const result = computeProfileScore(
      makeInput({
        followerCounts: [
          { syncedAt: NOW - 30 * DAY, followersCount: 1000 },
          { syncedAt: NOW, followersCount: 1100 }, // +10%
        ],
      })
    );
    const growth = result.dimensions.find((d) => d.name === "Growth")!;
    expect(growth.score).toBe(25);
  });

  test("growth score 0 with severe follower decline", () => {
    const result = computeProfileScore(
      makeInput({
        followerCounts: [
          { syncedAt: NOW - 30 * DAY, followersCount: 1000 },
          { syncedAt: NOW, followersCount: 800 }, // -20%
        ],
      })
    );
    const growth = result.dimensions.find((d) => d.name === "Growth")!;
    expect(growth.score).toBe(0);
  });

  test("consistency score 25 with perfectly even timestamps", () => {
    // Post every day at same interval
    const timestamps = Array.from({ length: 10 }, (_, i) => NOW - (9 - i) * DAY);
    const result = computeProfileScore(makeInput({ publishedTimestamps: timestamps }));
    const consistency = result.dimensions.find((d) => d.name === "Consistency")!;
    expect(consistency.score).toBe(25);
  });

  test("consistency score 0 with <2 timestamps", () => {
    const result = computeProfileScore(makeInput({ publishedTimestamps: [NOW] }));
    const consistency = result.dimensions.find((d) => d.name === "Consistency")!;
    expect(consistency.score).toBe(0);
  });

  test("tips are sorted high → medium → low priority", () => {
    const result = computeProfileScore(
      makeInput({ postsLast90d: 0, avgEngagementRate: 0, publishedTimestamps: [] })
    );
    const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const tips = result.tips;
    for (let i = 1; i < tips.length; i++) {
      expect(priorityOrder[tips[i].priority]).toBeGreaterThanOrEqual(
        priorityOrder[tips[i - 1].priority]
      );
    }
  });

  test("no tips when all dimensions are high", () => {
    const timestamps = Array.from({ length: 91 }, (_, i) => NOW - (90 - i) * DAY);
    const result = computeProfileScore(
      makeInput({
        platform: "FACEBOOK",
        postsLast90d: 65,
        publishedTimestamps: timestamps,
        avgEngagementRate: 5,
        followerCounts: [
          { syncedAt: NOW - 90 * DAY, followersCount: 1000 },
          { syncedAt: NOW, followersCount: 1100 },
        ],
      })
    );
    expect(result.tips).toHaveLength(0);
  });

  test("neutral growth score (10) when no follower data", () => {
    const result = computeProfileScore(makeInput({ followerCounts: [] }));
    const growth = result.dimensions.find((d) => d.name === "Growth")!;
    expect(growth.score).toBe(10);
  });
});
