import { computeQueueHealth } from "@/lib/queue-health";
import type { ScheduledPost } from "@/lib/queue-health";

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

describe("computeQueueHealth", () => {
  it("returns empty status when no posts", () => {
    const result = computeQueueHealth([]);
    expect(result.scheduledCount).toBe(0);
    expect(result.queueStatus).toBe("empty");
    expect(result.avgPostsPerDay).toBe(0);
    expect(result.queueRunwayDays).toBe(0);
    expect(result.nextScheduledAt).toBeNull();
    expect(result.platformBreakdown).toEqual([]);
  });

  it("returns 14 content gap days when no posts scheduled in next 14 days", () => {
    const result = computeQueueHealth([]);
    expect(result.contentGapDays).toHaveLength(14);
  });

  it("identifies healthy status when runway ≥ 14 days", () => {
    const posts: ScheduledPost[] = Array.from({ length: 20 }, (_, i) => ({
      scheduledAt: daysFromNow(i + 1),
      platforms: ["FACEBOOK"],
    }));
    const result = computeQueueHealth(posts);
    expect(result.queueStatus).toBe("healthy");
    expect(result.queueRunwayDays).toBeGreaterThanOrEqual(14);
  });

  it("identifies low status when runway 7–13 days", () => {
    // 7 posts over 7 days → 1/day avg → 7 days runway
    const posts: ScheduledPost[] = Array.from({ length: 7 }, (_, i) => ({
      scheduledAt: daysFromNow(i + 1),
      platforms: ["INSTAGRAM"],
    }));
    const result = computeQueueHealth(posts);
    expect(result.queueStatus).toBe("low");
    expect(result.queueRunwayDays).toBeGreaterThanOrEqual(7);
    expect(result.queueRunwayDays).toBeLessThan(14);
  });

  it("identifies critical status when runway < 7 days", () => {
    // 3 posts spread over 3 days → 0.1/day avg → very low runway
    const posts: ScheduledPost[] = [
      { scheduledAt: daysFromNow(1), platforms: [] },
      { scheduledAt: daysFromNow(2), platforms: [] },
      { scheduledAt: daysFromNow(3), platforms: [] },
    ];
    const result = computeQueueHealth(posts);
    expect(result.queueStatus).toBe("critical");
  });

  it("computes avgPostsPerDay from 30-day window", () => {
    // 30 posts one per day → 1/day
    const posts: ScheduledPost[] = Array.from({ length: 30 }, (_, i) => ({
      scheduledAt: daysFromNow(i + 1),
      platforms: [],
    }));
    const result = computeQueueHealth(posts);
    expect(result.avgPostsPerDay).toBe(1);
  });

  it("excludes past posts from future calculations", () => {
    const posts: ScheduledPost[] = [
      { scheduledAt: new Date(Date.now() - 86400000), platforms: [] }, // yesterday
      { scheduledAt: daysFromNow(1), platforms: ["FACEBOOK"] },
    ];
    const result = computeQueueHealth(posts);
    // nextScheduledAt should be the future post
    expect(result.nextScheduledAt).not.toBeNull();
  });

  it("detects content gaps correctly", () => {
    // Post on day 1 and day 3 only → day 2 and days 4-14 should be gaps
    const posts: ScheduledPost[] = [
      { scheduledAt: daysFromNow(1), platforms: [] },
      { scheduledAt: daysFromNow(3), platforms: [] },
    ];
    const result = computeQueueHealth(posts);
    // Days 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14 = 12 gaps
    expect(result.contentGapDays).toHaveLength(12);
  });

  it("builds platform breakdown sorted by count descending", () => {
    const posts: ScheduledPost[] = [
      { scheduledAt: daysFromNow(1), platforms: ["INSTAGRAM", "FACEBOOK"] },
      { scheduledAt: daysFromNow(2), platforms: ["INSTAGRAM"] },
      { scheduledAt: daysFromNow(3), platforms: ["FACEBOOK"] },
      { scheduledAt: daysFromNow(4), platforms: ["INSTAGRAM"] },
    ];
    const result = computeQueueHealth(posts);
    expect(result.platformBreakdown[0].platform).toBe("INSTAGRAM");
    expect(result.platformBreakdown[0].count).toBe(3);
    expect(result.platformBreakdown[1].platform).toBe("FACEBOOK");
    expect(result.platformBreakdown[1].count).toBe(2);
  });

  it("sets nextScheduledAt to the soonest future post", () => {
    const soon = daysFromNow(1);
    const later = daysFromNow(5);
    const posts: ScheduledPost[] = [
      { scheduledAt: later, platforms: [] },
      { scheduledAt: soon, platforms: [] },
    ];
    const result = computeQueueHealth(posts);
    expect(result.nextScheduledAt).toBe(soon.toISOString());
  });

  it("uses high runway estimate for posts beyond 30 days", () => {
    // Single post 60 days from now — no posts in 30-day window
    const posts: ScheduledPost[] = [
      { scheduledAt: daysFromNow(60), platforms: [] },
    ];
    const result = computeQueueHealth(posts);
    // When avgPostsPerDay=0 but posts exist, runway = count * 7
    expect(result.queueRunwayDays).toBe(7);
    expect(result.queueStatus).toBe("low");
  });
});
