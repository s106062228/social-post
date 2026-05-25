import { detectConflicts, buildResolutionPlan } from "../schedule-conflicts";
import type { ScheduledPostLike } from "../schedule-conflicts";

function makePost(
  id: string,
  scheduledAt: Date,
  platforms: string[] = []
): ScheduledPostLike {
  return {
    id,
    scheduledAt,
    publishResults: platforms.map((p) => ({ platform: p as never })),
  };
}

const BASE = new Date("2026-06-01T10:00:00Z");
function minutesAfterBase(n: number) {
  return new Date(BASE.getTime() + n * 60 * 1000);
}

describe("detectConflicts", () => {
  it("returns empty array when no posts", () => {
    expect(detectConflicts([], 30)).toEqual([]);
  });

  it("returns empty when posts are more than windowMinutes apart", () => {
    const a = makePost("a", minutesAfterBase(0), ["FACEBOOK"]);
    const b = makePost("b", minutesAfterBase(60), ["FACEBOOK"]);
    expect(detectConflicts([a, b], 30)).toHaveLength(0);
  });

  it("detects a conflict when same-platform posts are within windowMinutes", () => {
    const a = makePost("a", minutesAfterBase(0), ["FACEBOOK"]);
    const b = makePost("b", minutesAfterBase(15), ["FACEBOOK"]);
    const conflicts = detectConflicts([a, b], 30);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].postAId).toBe("a");
    expect(conflicts[0].postBId).toBe("b");
    expect(conflicts[0].platform).toBe("FACEBOOK");
  });

  it("does NOT flag cross-platform posts as conflicts", () => {
    const a = makePost("a", minutesAfterBase(0), ["FACEBOOK"]);
    const b = makePost("b", minutesAfterBase(10), ["INSTAGRAM"]);
    expect(detectConflicts([a, b], 30)).toHaveLength(0);
  });

  it("uses 'any' platform when posts have no platform info", () => {
    const a = makePost("a", minutesAfterBase(0));
    const b = makePost("b", minutesAfterBase(5));
    const conflicts = detectConflicts([a, b], 30);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].platform).toBe("any");
  });

  it("detects multiple overlapping conflicts", () => {
    const a = makePost("a", minutesAfterBase(0), ["TWITTER"]);
    const b = makePost("b", minutesAfterBase(10), ["TWITTER"]);
    const c = makePost("c", minutesAfterBase(20), ["TWITTER"]);
    // a-b and a-c and b-c are all within 30 min
    const conflicts = detectConflicts([a, b, c], 30);
    expect(conflicts.length).toBeGreaterThanOrEqual(2);
  });

  it("sets overlapMinutes correctly", () => {
    const a = makePost("a", minutesAfterBase(0), ["FACEBOOK"]);
    const b = makePost("b", minutesAfterBase(10), ["FACEBOOK"]);
    const conflicts = detectConflicts([a, b], 30);
    // overlapMinutes = round((windowMs - diff) / 60000) = round((30-10)*60000 / 60000) = 20
    expect(conflicts[0].overlapMinutes).toBe(20);
  });

  it("respects custom windowMinutes parameter", () => {
    const a = makePost("a", minutesAfterBase(0), ["FACEBOOK"]);
    const b = makePost("b", minutesAfterBase(45), ["FACEBOOK"]);
    // 45 min apart — no conflict with window=30
    expect(detectConflicts([a, b], 30)).toHaveLength(0);
    // but conflict with window=60
    expect(detectConflicts([a, b], 60)).toHaveLength(1);
  });
});

describe("buildResolutionPlan", () => {
  it("returns empty plan when no conflicts", () => {
    const posts = [makePost("a", minutesAfterBase(0))];
    expect(buildResolutionPlan(posts, [], 30)).toHaveLength(0);
  });

  it("spaces conflicting posts by spacingMinutes", () => {
    const a = makePost("a", minutesAfterBase(0), ["FACEBOOK"]);
    const b = makePost("b", minutesAfterBase(5), ["FACEBOOK"]);
    const conflicts = detectConflicts([a, b], 30);
    const plan = buildResolutionPlan([a, b], conflicts, 30);
    // b is too close — it should be moved
    const bUpdate = plan.find((r) => r.postId === "b");
    expect(bUpdate).toBeDefined();
    if (bUpdate) {
      const expectedTime = new Date(minutesAfterBase(0).getTime() + 30 * 60 * 1000);
      expect(bUpdate.newScheduledAt.getTime()).toBe(expectedTime.getTime());
    }
  });

  it("does not move the anchor (first post in cluster)", () => {
    const a = makePost("a", minutesAfterBase(0), ["FACEBOOK"]);
    const b = makePost("b", minutesAfterBase(5), ["FACEBOOK"]);
    const conflicts = detectConflicts([a, b], 30);
    const plan = buildResolutionPlan([a, b], conflicts, 30);
    // Post a should not be in the plan (it is the anchor)
    expect(plan.find((r) => r.postId === "a")).toBeUndefined();
  });

  it("handles three conflicting posts in sequence", () => {
    const a = makePost("a", minutesAfterBase(0), ["TWITTER"]);
    const b = makePost("b", minutesAfterBase(5), ["TWITTER"]);
    const c = makePost("c", minutesAfterBase(10), ["TWITTER"]);
    const conflicts = detectConflicts([a, b, c], 30);
    const plan = buildResolutionPlan([a, b, c], conflicts, 30);
    // b and c should be rescheduled
    expect(plan.length).toBeGreaterThanOrEqual(1);
    // All new times should be at least 30 min apart from each other
    const allTimes = [a.scheduledAt, ...plan.map((r) => r.newScheduledAt)].sort(
      (x, y) => x.getTime() - y.getTime()
    );
    for (let i = 1; i < allTimes.length; i++) {
      const gap = allTimes[i].getTime() - allTimes[i - 1].getTime();
      expect(gap).toBeGreaterThanOrEqual(30 * 60 * 1000 - 1);
    }
  });
});
