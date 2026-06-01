import { detectEmergingHashtags, type PostForTrending } from "../trending";

const NOW = new Date("2026-06-01T12:00:00Z");

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
}

function makePost(
  content: string,
  publishedAt: Date,
  likes = 0,
  comments = 0,
  shares = 0
): PostForTrending {
  return {
    content,
    publishedAt,
    insights: [{ likes, comments, shares, reach: 100, impressions: 0 }],
  };
}

describe("detectEmergingHashtags", () => {
  it("returns empty array for empty posts", () => {
    const result = detectEmergingHashtags([]);
    expect(result).toHaveLength(0);
  });

  it("returns empty array when no posts have hashtags", () => {
    const posts = [makePost("Hello world", daysAgo(3))];
    const result = detectEmergingHashtags(posts);
    expect(result).toHaveLength(0);
  });

  it("identifies a rising hashtag (recent avg > baseline avg by 20%+)", () => {
    const posts = [
      // Recent posts (< 7 days): high engagement with #growth
      makePost("Check out #growth tips", daysAgo(1), 50, 10, 5),
      makePost("More #growth insights", daysAgo(3), 60, 8, 4),
      // Baseline posts (7–30 days): low engagement with #growth
      makePost("Old #growth post", daysAgo(10), 5, 1, 0),
      makePost("Another #growth post", daysAgo(15), 3, 0, 0),
    ];

    const result = detectEmergingHashtags(posts, 30);
    const growth = result.find((h) => h.hashtag === "growth");
    expect(growth).toBeDefined();
    expect(growth!.trend).toBe("rising");
    expect(growth!.velocityScore).toBeGreaterThan(100);
    expect(growth!.recentPostCount).toBe(2);
    expect(growth!.baselinePostCount).toBe(2);
  });

  it("identifies a falling hashtag (recent avg < baseline avg by 20%+)", () => {
    const posts = [
      // Baseline: high engagement
      makePost("Hot #viral content", daysAgo(10), 100, 20, 15),
      makePost("Trending #viral", daysAgo(12), 90, 18, 12),
      // Recent: low engagement
      makePost("Old #viral attempt", daysAgo(2), 5, 0, 0),
    ];

    const result = detectEmergingHashtags(posts, 30);
    const viral = result.find((h) => h.hashtag === "viral");
    expect(viral).toBeDefined();
    expect(viral!.trend).toBe("falling");
    expect(viral!.velocityScore).toBeLessThan(100);
  });

  it("identifies a stable hashtag (ratio between 0.8 and 1.2)", () => {
    const posts = [
      makePost("#tips for everyone", daysAgo(2), 20, 4, 2),
      makePost("More #tips", daysAgo(10), 22, 4, 2),
    ];

    const result = detectEmergingHashtags(posts, 30);
    const tips = result.find((h) => h.hashtag === "tips");
    expect(tips).toBeDefined();
    expect(tips!.trend).toBe("stable");
  });

  it("marks new hashtags with only recent posts as rising with score 150", () => {
    const posts = [
      makePost("Brand new #launch hashtag", daysAgo(1), 10, 2, 1),
      makePost("Excited about the #launch", daysAgo(3), 15, 3, 2),
    ];

    const result = detectEmergingHashtags(posts, 30);
    const launch = result.find((h) => h.hashtag === "launch");
    expect(launch).toBeDefined();
    expect(launch!.trend).toBe("rising");
    expect(launch!.velocityScore).toBe(150);
    expect(launch!.baselinePostCount).toBe(0);
  });

  it("marks hashtags with only baseline posts as falling with score 10", () => {
    const posts = [
      makePost("Old #legacy content", daysAgo(15), 10, 2, 1),
      makePost("More #legacy stuff", daysAgo(20), 8, 1, 0),
    ];

    const result = detectEmergingHashtags(posts, 30);
    const legacy = result.find((h) => h.hashtag === "legacy");
    expect(legacy).toBeDefined();
    expect(legacy!.trend).toBe("falling");
    expect(legacy!.velocityScore).toBe(10);
    expect(legacy!.recentPostCount).toBe(0);
  });

  it("sorts rising hashtags before stable before falling", () => {
    const posts = [
      // Stable #daily
      makePost("#daily update", daysAgo(2), 10, 2, 1),
      makePost("My #daily post", daysAgo(10), 11, 2, 1),
      // Rising #boost
      makePost("#boost engagement now", daysAgo(1), 100, 20, 15),
      makePost("Old #boost", daysAgo(12), 5, 1, 0),
      // Falling #old
      makePost("Old #old content", daysAgo(10), 50, 10, 8),
      makePost("#old stuff", daysAgo(20), 60, 12, 9),
      makePost("My #old post", daysAgo(2), 2, 0, 0),
    ];

    const result = detectEmergingHashtags(posts, 30);
    const trendOrder = result.map((h) => h.trend);

    // All rising should appear before stable, stable before falling
    const firstFallingIdx = trendOrder.indexOf("falling");
    const lastRisingIdx = trendOrder.lastIndexOf("rising");
    const lastStableIdx = trendOrder.lastIndexOf("stable");

    if (firstFallingIdx !== -1 && lastRisingIdx !== -1) {
      expect(lastRisingIdx).toBeLessThan(firstFallingIdx);
    }
    if (firstFallingIdx !== -1 && lastStableIdx !== -1) {
      expect(lastStableIdx).toBeLessThan(firstFallingIdx);
    }
  });

  it("respects the limit parameter", () => {
    const posts = Array.from({ length: 30 }, (_, i) =>
      makePost(`#tag${i} content`, daysAgo(1 + (i % 7)), 10, 2, 1)
    );

    const result = detectEmergingHashtags(posts, 30, 5);
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it("ignores posts outside the period window", () => {
    const posts = [
      makePost("#fresh hashtag", daysAgo(1), 10, 2, 1),
      makePost("#fresh but old", daysAgo(100), 10, 2, 1), // outside 30d window
    ];

    const result = detectEmergingHashtags(posts, 30);
    const fresh = result.find((h) => h.hashtag === "fresh");
    // Only the recent post should count
    expect(fresh?.recentPostCount).toBe(1);
    expect(fresh?.baselinePostCount).toBe(0);
  });

  it("handles posts with no publishedAt (skips them)", () => {
    const posts: PostForTrending[] = [
      { content: "#scheduled post", publishedAt: null, insights: [] },
      makePost("#real post", daysAgo(2), 10, 2, 1),
    ];

    const result = detectEmergingHashtags(posts, 30);
    expect(result.find((h) => h.hashtag === "scheduled")).toBeUndefined();
    expect(result.find((h) => h.hashtag === "real")).toBeDefined();
  });

  it("aggregates insights across multiple platforms for the same post", () => {
    const post: PostForTrending = {
      content: "#crosspost content here",
      publishedAt: daysAgo(2),
      insights: [
        { likes: 10, comments: 2, shares: 1, reach: 100, impressions: 500 },
        { likes: 20, comments: 4, shares: 2, reach: 200, impressions: 1000 },
      ],
    };
    const baselinePost = makePost("#crosspost old", daysAgo(12), 5, 1, 0);

    const result = detectEmergingHashtags([post, baselinePost], 30);
    const cp = result.find((h) => h.hashtag === "crosspost");
    expect(cp).toBeDefined();
    // Recent engagement should be higher due to aggregated platforms
    expect(cp!.recentEngagement).toBeGreaterThan(cp!.baselineEngagement);
  });
});
