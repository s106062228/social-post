import { detectContentFatigue, type PostForFatigue } from "../content-fatigue";

const NOW = new Date("2026-05-24T12:00:00Z");

// Helper: create a publishedAt timestamp n days before NOW
function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
}

function makeResult(
  platform: string,
  publishedAt: Date,
  likes = 0,
  comments = 0,
  shares = 0,
  reach = 100
): PostForFatigue["publishResults"][number] {
  return {
    platform,
    status: "PUBLISHED",
    publishedAt,
    insights: { likes, comments, shares, reach, impressions: 0 },
  };
}

function makePost(results: PostForFatigue["publishResults"]): PostForFatigue {
  return { publishResults: results };
}

describe("detectContentFatigue", () => {
  // Freeze "now" by using publishedAt relative to NOW
  // The utility uses Date.now() internally, so we test with realistic data
  // approximating the 7d/30d windows

  it("returns no platforms and overallFatigued=false for empty posts", () => {
    const result = detectContentFatigue([]);
    expect(result.platforms).toHaveLength(0);
    expect(result.overallFatigued).toBe(false);
    expect(result.analyzedAt).toBeDefined();
  });

  it("reports improving trend when recent engagement exceeds baseline by 10%+", () => {
    // Baseline (8–30 days ago): low engagement
    // Recent (0–7 days): high engagement
    const posts = [
      makePost([makeResult("INSTAGRAM", daysAgo(1), 50, 10, 5, 500)]), // recent
      makePost([makeResult("INSTAGRAM", daysAgo(3), 60, 8, 4, 600)]),  // recent
      makePost([makeResult("INSTAGRAM", daysAgo(10), 5, 1, 1, 50)]),   // baseline
      makePost([makeResult("INSTAGRAM", daysAgo(15), 4, 1, 0, 40)]),   // baseline
      makePost([makeResult("INSTAGRAM", daysAgo(20), 6, 1, 1, 60)]),   // baseline
    ];

    const result = detectContentFatigue(posts);
    expect(result.platforms).toHaveLength(1);
    const ig = result.platforms[0]!;
    expect(ig.platform).toBe("INSTAGRAM");
    expect(ig.trend).toBe("improving");
    expect(ig.isFatigued).toBe(false);
    expect(ig.recentPostCount).toBe(2);
    expect(ig.baselinePostCount).toBe(3);
  });

  it("reports stable trend when recent engagement is 70-110% of baseline", () => {
    // Baseline: ~100 engagement per post
    // Recent: ~90 engagement per post (90% → stable)
    const posts = [
      makePost([makeResult("FACEBOOK", daysAgo(2), 20, 5, 2, 100)]),  // recent ≈ 85
      makePost([makeResult("FACEBOOK", daysAgo(5), 18, 4, 2, 100)]),  // recent ≈ 80
      makePost([makeResult("FACEBOOK", daysAgo(10), 20, 5, 2, 100)]), // baseline ≈ 85
      makePost([makeResult("FACEBOOK", daysAgo(15), 22, 6, 2, 100)]), // baseline ≈ 96
      makePost([makeResult("FACEBOOK", daysAgo(22), 19, 5, 2, 100)]), // baseline ≈ 87
    ];

    const result = detectContentFatigue(posts);
    const fb = result.platforms.find((p) => p.platform === "FACEBOOK")!;
    expect(fb).toBeDefined();
    expect(fb.trend).toBe("stable");
    expect(fb.isFatigued).toBe(false);
  });

  it("reports declining trend and isFatigued=true when recent ≤ 70% of baseline", () => {
    // Baseline: high engagement (~500 per post)
    // Recent: very low engagement (~100 per post) → ~20% → fatigued
    const posts = [
      makePost([makeResult("TWITTER", daysAgo(1), 5, 1, 0, 50)]),    // recent ≈ 68
      makePost([makeResult("TWITTER", daysAgo(4), 4, 0, 0, 40)]),    // recent ≈ 52
      makePost([makeResult("TWITTER", daysAgo(10), 50, 10, 5, 400)]),  // baseline ≈ 620
      makePost([makeResult("TWITTER", daysAgo(16), 60, 12, 6, 500)]), // baseline ≈ 760
      makePost([makeResult("TWITTER", daysAgo(25), 55, 11, 5, 450)]), // baseline ≈ 685
    ];

    const result = detectContentFatigue(posts);
    const tw = result.platforms.find((p) => p.platform === "TWITTER")!;
    expect(tw).toBeDefined();
    expect(tw.trend).toBe("declining");
    expect(tw.isFatigued).toBe(true);
  });

  it("returns neutral fatigueScore=75 and stable trend when no baseline posts", () => {
    // Only posts in last 7 days — no baseline
    const posts = [
      makePost([makeResult("THREADS", daysAgo(1), 10, 2, 1, 100)]),
      makePost([makeResult("THREADS", daysAgo(3), 12, 3, 1, 120)]),
    ];

    const result = detectContentFatigue(posts);
    const threads = result.platforms.find((p) => p.platform === "THREADS")!;
    expect(threads).toBeDefined();
    expect(threads.fatigueScore).toBe(75);
    expect(threads.trend).toBe("stable");
    expect(threads.isFatigued).toBe(false);
    expect(threads.baselinePostCount).toBe(0);
  });

  it("sets overallFatigued=true when any platform is fatigued", () => {
    const posts = [
      // INSTAGRAM: healthy
      makePost([makeResult("INSTAGRAM", daysAgo(2), 50, 10, 5, 500)]),
      makePost([makeResult("INSTAGRAM", daysAgo(10), 45, 9, 4, 480)]),
      // TWITTER: fatigued
      makePost([makeResult("TWITTER", daysAgo(1), 1, 0, 0, 5)]),
      makePost([makeResult("TWITTER", daysAgo(10), 50, 10, 5, 400)]),
      makePost([makeResult("TWITTER", daysAgo(18), 55, 11, 5, 450)]),
    ];

    const result = detectContentFatigue(posts);
    expect(result.overallFatigued).toBe(true);
  });

  it("filters by targetPlatform when specified", () => {
    const posts = [
      makePost([makeResult("INSTAGRAM", daysAgo(2), 20, 5, 2, 200)]),
      makePost([makeResult("FACEBOOK", daysAgo(2), 15, 3, 1, 150)]),
    ];

    const result = detectContentFatigue(posts, "INSTAGRAM");
    expect(result.platforms).toHaveLength(1);
    expect(result.platforms[0]!.platform).toBe("INSTAGRAM");
  });

  it("excludes posts older than 30 days", () => {
    const posts = [
      makePost([makeResult("LINKEDIN", daysAgo(31), 100, 20, 10, 1000)]), // outside window
      makePost([makeResult("LINKEDIN", daysAgo(32), 120, 25, 12, 1200)]), // outside window
    ];

    const result = detectContentFatigue(posts);
    expect(result.platforms).toHaveLength(0);
  });

  it("excludes non-PUBLISHED results", () => {
    const posts: PostForFatigue[] = [
      {
        publishResults: [
          {
            platform: "INSTAGRAM",
            status: "FAILED",
            publishedAt: daysAgo(2),
            insights: { likes: 100, comments: 20, shares: 10, reach: 1000, impressions: 5000 },
          },
        ],
      },
    ];

    const result = detectContentFatigue(posts);
    expect(result.platforms).toHaveLength(0);
  });

  it("sorts platforms by fatigueScore ascending (worst first)", () => {
    const posts = [
      // INSTAGRAM: very healthy (only recent, neutral score=75)
      makePost([makeResult("INSTAGRAM", daysAgo(1), 100, 20, 10, 1000)]),
      // FACEBOOK: fatigued (recent << baseline)
      makePost([makeResult("FACEBOOK", daysAgo(2), 1, 0, 0, 5)]),
      makePost([makeResult("FACEBOOK", daysAgo(10), 80, 15, 8, 800)]),
      makePost([makeResult("FACEBOOK", daysAgo(20), 90, 18, 9, 900)]),
    ];

    const result = detectContentFatigue(posts);
    expect(result.platforms.length).toBeGreaterThanOrEqual(2);
    const scores = result.platforms.map((p) => p.fatigueScore);
    expect(scores[0]!).toBeLessThanOrEqual(scores[scores.length - 1]!);
  });

  it("handles posts with null insights gracefully", () => {
    const posts: PostForFatigue[] = [
      {
        publishResults: [
          {
            platform: "REDDIT",
            status: "PUBLISHED",
            publishedAt: daysAgo(2),
            insights: null,
          },
        ],
      },
    ];

    const result = detectContentFatigue(posts);
    const reddit = result.platforms.find((p) => p.platform === "REDDIT");
    expect(reddit).toBeDefined();
    expect(reddit!.recentAvgEngagement).toBe(0);
  });
});
