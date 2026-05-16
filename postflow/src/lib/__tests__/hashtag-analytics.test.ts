import {
  extractHashtags,
  computeEngagementScore,
  computeHashtagStats,
} from "../hashtag-analytics";

describe("extractHashtags", () => {
  it("returns empty array for content with no hashtags", () => {
    expect(extractHashtags("Hello world, no tags here")).toEqual([]);
  });

  it("extracts a single hashtag", () => {
    expect(extractHashtags("Check out #marketing tips")).toEqual(["marketing"]);
  });

  it("extracts multiple hashtags", () => {
    const result = extractHashtags("Loving #socialmedia and #content today!");
    expect(result).toContain("socialmedia");
    expect(result).toContain("content");
    expect(result).toHaveLength(2);
  });

  it("deduplicates repeated hashtags", () => {
    expect(extractHashtags("#marketing tips #marketing strategy")).toEqual([
      "marketing",
    ]);
  });

  it("lowercases hashtags", () => {
    expect(extractHashtags("#Marketing #SOCIAL")).toEqual([
      "marketing",
      "social",
    ]);
  });

  it("handles hashtag at start and end of string", () => {
    const result = extractHashtags("#start content #end");
    expect(result).toContain("start");
    expect(result).toContain("end");
  });
});

describe("computeEngagementScore", () => {
  it("returns 0 for all-null insights", () => {
    expect(
      computeEngagementScore({
        impressions: null,
        reach: null,
        likes: null,
        comments: null,
        shares: null,
      })
    ).toBe(0);
  });

  it("applies correct weights", () => {
    const score = computeEngagementScore({
      impressions: 100,
      reach: 80,
      likes: 10,
      comments: 5,
      shares: 3,
    });
    // 10×3 + 5×5 + 3×4 + 80×1 + 100×0.5 = 30+25+12+80+50 = 197
    expect(score).toBe(197);
  });

  it("treats null values as 0", () => {
    const score = computeEngagementScore({
      impressions: null,
      reach: null,
      likes: 2,
      comments: null,
      shares: null,
    });
    // 2×3 = 6
    expect(score).toBe(6);
  });
});

describe("computeHashtagStats", () => {
  it("returns empty array for empty posts", () => {
    expect(computeHashtagStats([])).toEqual([]);
  });

  it("returns empty array for posts with no hashtags", () => {
    const posts = [
      { content: "No hashtags here", insights: [] },
      { content: "Also no hashtags", insights: [] },
    ];
    expect(computeHashtagStats(posts)).toEqual([]);
  });

  it("counts posts using each hashtag", () => {
    const posts = [
      { content: "#marketing strategy", insights: [] },
      { content: "#marketing tips", insights: [] },
      { content: "#content tips", insights: [] },
    ];
    const stats = computeHashtagStats(posts);
    const marketing = stats.find((s) => s.hashtag === "marketing");
    const content = stats.find((s) => s.hashtag === "content");
    expect(marketing?.postCount).toBe(2);
    expect(content?.postCount).toBe(1);
  });

  it("aggregates insights across multiple platforms for one post", () => {
    const posts = [
      {
        content: "#test post",
        insights: [
          { impressions: 100, reach: 80, likes: 5, comments: 2, shares: 1 },
          { impressions: 50, reach: 40, likes: 3, comments: 1, shares: 0 },
        ],
      },
    ];
    const stats = computeHashtagStats(posts);
    const stat = stats.find((s) => s.hashtag === "test");
    expect(stat).toBeDefined();
    expect(stat!.totalImpressions).toBe(150);
    expect(stat!.totalReach).toBe(120);
    expect(stat!.totalLikes).toBe(8);
  });

  it("computes avgEngagement as totalEngagement / postCount", () => {
    const posts = [
      {
        content: "#perf post one",
        insights: [
          { impressions: 0, reach: 0, likes: 10, comments: 0, shares: 0 },
        ],
      },
      {
        content: "#perf post two",
        insights: [
          { impressions: 0, reach: 0, likes: 20, comments: 0, shares: 0 },
        ],
      },
    ];
    const stats = computeHashtagStats(posts);
    const stat = stats.find((s) => s.hashtag === "perf");
    // post1 engagement = 10×3=30; post2 engagement = 20×3=60; avg = 45
    expect(stat?.avgEngagement).toBe(45);
  });

  it("sorts by avgEngagement descending", () => {
    const posts = [
      {
        content: "#low engagement",
        insights: [{ impressions: 0, reach: 0, likes: 1, comments: 0, shares: 0 }],
      },
      {
        content: "#high engagement",
        insights: [{ impressions: 0, reach: 0, likes: 100, comments: 0, shares: 0 }],
      },
    ];
    const stats = computeHashtagStats(posts);
    expect(stats[0]?.hashtag).toBe("high");
    expect(stats[1]?.hashtag).toBe("low");
  });

  it("respects limit parameter", () => {
    const posts = Array.from({ length: 50 }, (_, i) => ({
      content: `#tag${i} content`,
      insights: [],
    }));
    expect(computeHashtagStats(posts, 10)).toHaveLength(10);
  });

  it("posts with no insights count with engagement 0", () => {
    const posts = [
      { content: "#noinsights post", insights: [] },
    ];
    const stats = computeHashtagStats(posts);
    const stat = stats.find((s) => s.hashtag === "noinsights");
    expect(stat?.postCount).toBe(1);
    expect(stat?.avgEngagement).toBe(0);
    expect(stat?.totalLikes).toBe(0);
  });
});
