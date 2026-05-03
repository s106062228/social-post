import { computeConsistency } from "../consistency";

// Helper: create a Date n days before `now`
function daysAgo(n: number, now: Date): Date {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  d.setHours(12, 0, 0, 0);
  return d;
}

// Fixed reference "today" for all tests
const NOW = new Date("2026-05-03T12:00:00Z");

describe("computeConsistency", () => {
  // ── Score edges ─────────────────────────────────────────────────────────────

  it("returns score=0 and streak=0 when no posts exist", () => {
    const result = computeConsistency([], 30, NOW);
    expect(result.score).toBe(0);
    expect(result.streak).toBe(0);
    expect(result.avgPostsPerWeek).toBe(0);
    expect(result.totalPosts).toBe(0);
    expect(result.periodDays).toBe(30);
  });

  it("returns score=100 when every week has a post (5-week window, 5 posts)", () => {
    // Post on each of 5 Mondays across a 35-day window → every week filled
    const posts = [0, 7, 14, 21, 28].map((n) => daysAgo(n, NOW));
    const result = computeConsistency(posts, 35, NOW);
    expect(result.score).toBe(100);
  });

  it("returns score between 0 and 100", () => {
    const posts = [daysAgo(2, NOW), daysAgo(20, NOW)];
    const result = computeConsistency(posts, 30, NOW);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("ignores posts outside the analysis window", () => {
    const outsideWindow = daysAgo(100, NOW); // well outside 30-day window
    const result = computeConsistency([outsideWindow], 30, NOW);
    expect(result.totalPosts).toBe(0);
    expect(result.score).toBe(0);
  });

  // ── Streak calculation ──────────────────────────────────────────────────────

  it("streak=1 when only the current week has a post", () => {
    const result = computeConsistency([daysAgo(0, NOW)], 30, NOW);
    expect(result.streak).toBe(1);
  });

  it("streak=0 when most recent week has no post", () => {
    // Post 10 days ago — current week (last 7 days) has no post
    const result = computeConsistency([daysAgo(10, NOW)], 30, NOW);
    expect(result.streak).toBe(0);
  });

  it("streak counts consecutive weeks correctly", () => {
    // Posts in current week AND the week before → streak=2
    const posts = [daysAgo(1, NOW), daysAgo(8, NOW)];
    const result = computeConsistency(posts, 30, NOW);
    expect(result.streak).toBeGreaterThanOrEqual(2);
  });

  // ── Average posts/week ──────────────────────────────────────────────────────

  it("computes avgPostsPerWeek correctly", () => {
    // 3 posts in ~30 days (~4.3 weeks) → avg ≈ 0.7
    const posts = [daysAgo(1, NOW), daysAgo(10, NOW), daysAgo(20, NOW)];
    const result = computeConsistency(posts, 30, NOW);
    expect(result.avgPostsPerWeek).toBeGreaterThan(0);
    expect(result.totalPosts).toBe(3);
  });

  // ── Gap detection ───────────────────────────────────────────────────────────

  it("detects no gaps when posts are frequent", () => {
    // Post every day — no 7-day gap possible
    const posts = Array.from({ length: 30 }, (_, i) => daysAgo(i, NOW));
    const result = computeConsistency(posts, 30, NOW);
    expect(result.gaps).toHaveLength(0);
  });

  it("detects a gap when there is a 10-day silent period", () => {
    // Posts at day 0 and day 20 → 19-day gap between them
    const posts = [daysAgo(0, NOW), daysAgo(20, NOW)];
    const result = computeConsistency(posts, 30, NOW);
    expect(result.gaps.length).toBeGreaterThan(0);
    const longestGap = Math.max(...result.gaps.map((g) => g.days));
    expect(longestGap).toBeGreaterThanOrEqual(10);
  });

  it("does not report a gap shorter than 7 days", () => {
    // Posts at day 0 and day 5 — only a 4-day gap, below threshold
    const posts = [daysAgo(0, NOW), daysAgo(5, NOW)];
    const result = computeConsistency(posts, 30, NOW);
    // No gap ≥ 7 days between two posts 5 days apart
    for (const gap of result.gaps) {
      expect(gap.days).toBeGreaterThanOrEqual(7);
    }
  });

  it("gap objects have correct shape", () => {
    const posts = [daysAgo(0, NOW), daysAgo(25, NOW)];
    const result = computeConsistency(posts, 30, NOW);
    for (const gap of result.gaps) {
      expect(gap).toHaveProperty("start");
      expect(gap).toHaveProperty("end");
      expect(gap).toHaveProperty("days");
      expect(typeof gap.start).toBe("string");
      expect(typeof gap.end).toBe("string");
      expect(typeof gap.days).toBe("number");
      expect(gap.days).toBeGreaterThanOrEqual(7);
    }
  });

  // ── Period boundary ─────────────────────────────────────────────────────────

  it("respects periodDays parameter", () => {
    const r30 = computeConsistency([], 30, NOW);
    const r90 = computeConsistency([], 90, NOW);
    expect(r30.periodDays).toBe(30);
    expect(r90.periodDays).toBe(90);
  });
});
