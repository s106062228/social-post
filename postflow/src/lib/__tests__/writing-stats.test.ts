import { analyzeWritingStats, type PostForStats } from "../writing-stats";

function makePost(content: string, updatedAt: Date = new Date("2026-01-07T10:00:00Z")): PostForStats {
  return { content, updatedAt };
}

describe("analyzeWritingStats", () => {
  it("returns zeros for empty input", () => {
    const result = analyzeWritingStats([]);
    expect(result.totalPosts).toBe(0);
    expect(result.avgWordCount).toBe(0);
    expect(result.avgCharCount).toBe(0);
    expect(result.avgHashtagCount).toBe(0);
    expect(result.avgSentenceCount).toBe(0);
    expect(result.postsWithLinksPercent).toBe(0);
    expect(result.postsWithEmojisPercent).toBe(0);
    expect(result.topEmojis).toEqual([]);
    expect(result.postingDayDistribution).toHaveLength(7);
    expect(result.postingHourDistribution).toHaveLength(24);
  });

  it("computes avgWordCount correctly", () => {
    const posts = [
      makePost("hello world foo"), // 3 words
      makePost("one two"),          // 2 words
    ];
    const result = analyzeWritingStats(posts);
    expect(result.avgWordCount).toBe(3); // (3+2)/2 = 2.5 → rounds to 3... wait, Math.round(2.5) = 3
    // Actually (3+2)/2 = 2.5, Math.round(2.5) = 3 in JS
    // Let me recalculate: 5 total / 2 posts = 2.5, round = 3
    // Hmm, let me check - (3+2) = 5 words total, 5/2 = 2.5, Math.round(2.5) = 3 in JS
    expect(result.totalPosts).toBe(2);
  });

  it("counts hashtags correctly", () => {
    const posts = [
      makePost("Check this out #marketing #tips"),
      makePost("No hashtags here"),
    ];
    const result = analyzeWritingStats(posts);
    // Total hashtags: 2 + 0 = 2, avg = 2/2 = 1.0
    expect(result.avgHashtagCount).toBe(1.0);
  });

  it("detects posts with links", () => {
    const posts = [
      makePost("Visit https://example.com for more"),
      makePost("No link here"),
      makePost("See https://foo.com and https://bar.com"),
    ];
    const result = analyzeWritingStats(posts);
    // 2 out of 3 posts have links → 66%
    expect(result.postsWithLinksPercent).toBe(67);
  });

  it("detects emoji presence and counts top emojis", () => {
    const posts = [
      makePost("Great news 🎉🎉🎉"),
      makePost("Love it ❤️"),
      makePost("No emoji here"),
    ];
    const result = analyzeWritingStats(posts);
    // 2 out of 3 posts have emojis
    expect(result.postsWithEmojisPercent).toBe(67);
    // 🎉 should appear 3 times and be the top emoji
    const top = result.topEmojis[0];
    expect(top?.emoji).toBe("🎉");
    expect(top?.count).toBe(3);
  });

  it("builds posting day distribution from updatedAt", () => {
    // Tuesday = 2, Wednesday = 3, Wednesday = 3
    const posts = [
      makePost("post A", new Date("2026-01-06T10:00:00Z")), // Tuesday
      makePost("post B", new Date("2026-01-07T10:00:00Z")), // Wednesday
      makePost("post C", new Date("2026-01-07T14:00:00Z")), // Wednesday
    ];
    const result = analyzeWritingStats(posts);
    const tue = result.postingDayDistribution.find((d) => d.day === "Tue");
    const wed = result.postingDayDistribution.find((d) => d.day === "Wed");
    expect(tue?.count).toBe(1);
    expect(wed?.count).toBe(2);
    expect(result.postingDayDistribution).toHaveLength(7);
  });

  it("builds posting hour distribution from updatedAt", () => {
    const posts = [
      makePost("post A", new Date("2026-01-07T09:00:00Z")), // hour 9
      makePost("post B", new Date("2026-01-07T09:30:00Z")), // hour 9
      makePost("post C", new Date("2026-01-07T18:00:00Z")), // hour 18
    ];
    const result = analyzeWritingStats(posts);
    expect(result.postingHourDistribution).toHaveLength(24);
    const h9 = result.postingHourDistribution.find((h) => h.hour === 9);
    const h18 = result.postingHourDistribution.find((h) => h.hour === 18);
    expect(h9?.count).toBe(2);
    expect(h18?.count).toBe(1);
  });

  it("computes avgCharCount correctly", () => {
    const posts = [
      makePost("abc"),   // 3 chars
      makePost("abcde"), // 5 chars
    ];
    const result = analyzeWritingStats(posts);
    // (3+5)/2 = 4
    expect(result.avgCharCount).toBe(4);
  });

  it("limits topEmojis to 10", () => {
    // Create 12 different emojis
    const emojis = ["😀", "😁", "😂", "🤣", "😃", "😄", "😅", "😆", "😇", "😈", "😉", "😊"];
    const posts = [makePost(emojis.join(" "))];
    const result = analyzeWritingStats(posts);
    expect(result.topEmojis.length).toBeLessThanOrEqual(10);
  });
});
