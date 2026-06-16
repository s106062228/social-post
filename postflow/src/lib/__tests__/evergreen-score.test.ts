import {
  computeEvergreenScore,
  evergreenLabel,
  type EvergreenPostInput,
} from "@/lib/evergreen-score";

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function makePost(overrides: Partial<EvergreenPostInput> = {}): EvergreenPostInput {
  return {
    id: "post-1",
    content: "A great tip for productivity that stands the test of time.",
    publishedAt: daysAgo(60),
    createdAt: daysAgo(60),
    isEvergreen: false,
    insights: { likes: 50, comments: 10, shares: 20, reach: 1000, impressions: 1500 },
    ...overrides,
  };
}

describe("computeEvergreenScore", () => {
  it("returns a score between 0 and 100", () => {
    const result = computeEvergreenScore(makePost());
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("maps postId and content correctly", () => {
    const post = makePost({ id: "abc", content: "Hello world #tips" });
    const result = computeEvergreenScore(post);
    expect(result.postId).toBe("abc");
    expect(result.content).toBe("Hello world #tips");
    expect(result.isEvergreen).toBe(false);
  });

  it("gives full timelessness score for content with no time-sensitive keywords", () => {
    const post = makePost({ content: "How to build better habits step by step" });
    const result = computeEvergreenScore(post);
    expect(result.timelessnessScore).toBe(30);
  });

  it("reduces timelessness score for each time-sensitive keyword hit", () => {
    const post = makePost({ content: "Breaking news update today just announced" });
    const result = computeEvergreenScore(post);
    // Should hit at least 3 keywords → timelessnessScore <= 0
    expect(result.timelessnessScore).toBe(0);
  });

  it("gives optimal hashtag score for 3-10 hashtags", () => {
    const post = makePost({
      content: "Tips #productivity #focus #habits #mindset #growth",
    });
    const result = computeEvergreenScore(post);
    expect(result.hashtagScore).toBe(10);
  });

  it("gives partial hashtag score for 0 hashtags", () => {
    const post = makePost({ content: "Great productivity tip here" });
    const result = computeEvergreenScore(post);
    expect(result.hashtagScore).toBe(3);
  });

  it("gives reduced hashtag score for too many hashtags", () => {
    const post = makePost({
      content:
        "#a #b #c #d #e #f #g #h #i #j #k #l", // 12 hashtags
    });
    const result = computeEvergreenScore(post);
    expect(result.hashtagScore).toBeLessThan(10);
  });

  it("returns zero engagementScore for posts with no engagement", () => {
    const post = makePost({
      insights: { likes: 0, comments: 0, shares: 0, reach: 0, impressions: 0 },
    });
    const result = computeEvergreenScore(post);
    expect(result.engagementScore).toBe(0);
    expect(result.ageInDays).toBeGreaterThan(0);
  });

  it("uses createdAt when publishedAt is null", () => {
    const post = makePost({ publishedAt: null, createdAt: daysAgo(90) });
    const result = computeEvergreenScore(post);
    expect(result.ageInDays).toBeGreaterThanOrEqual(89);
  });
});

describe("evergreenLabel", () => {
  it("returns Excellent for score >= 70", () => {
    expect(evergreenLabel(70)).toBe("Excellent");
    expect(evergreenLabel(100)).toBe("Excellent");
  });

  it("returns Good for score 50-69", () => {
    expect(evergreenLabel(50)).toBe("Good");
    expect(evergreenLabel(69)).toBe("Good");
  });

  it("returns Fair for score 30-49", () => {
    expect(evergreenLabel(30)).toBe("Fair");
    expect(evergreenLabel(49)).toBe("Fair");
  });

  it("returns Poor for score below 30", () => {
    expect(evergreenLabel(0)).toBe("Poor");
    expect(evergreenLabel(29)).toBe("Poor");
  });
});
