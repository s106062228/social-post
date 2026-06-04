import {
  getMilestonesCrossed,
  getNextMilestone,
  formatMilestone,
  projectGrowth,
  computeGrowthRate,
  MILESTONE_THRESHOLDS,
} from "@/lib/follower-milestones";

describe("getMilestonesCrossed", () => {
  it("returns empty array when no threshold crossed", () => {
    expect(getMilestonesCrossed(50, 90)).toEqual([]);
  });

  it("returns single milestone when one threshold is crossed", () => {
    expect(getMilestonesCrossed(90, 110)).toEqual([100]);
  });

  it("returns multiple milestones when several thresholds are crossed", () => {
    expect(getMilestonesCrossed(90, 260)).toEqual([100, 250]);
  });

  it("returns milestone when exactly on threshold", () => {
    expect(getMilestonesCrossed(99, 100)).toEqual([100]);
  });

  it("does not return milestone when previous count already at threshold", () => {
    expect(getMilestonesCrossed(100, 150)).toEqual([]);
  });
});

describe("getNextMilestone", () => {
  it("returns 100 for count below 100", () => {
    expect(getNextMilestone(50)).toBe(100);
  });

  it("returns correct next milestone", () => {
    expect(getNextMilestone(1000)).toBe(2500);
  });

  it("returns null when past all thresholds", () => {
    expect(getNextMilestone(2_000_000)).toBeNull();
  });

  it("returns next milestone when exactly at a threshold", () => {
    expect(getNextMilestone(1000)).toBe(2500);
  });
});

describe("formatMilestone", () => {
  it("formats raw number below 1000", () => {
    expect(formatMilestone(100)).toBe("100");
    expect(formatMilestone(500)).toBe("500");
  });

  it("formats K for thousands", () => {
    expect(formatMilestone(1000)).toBe("1K");
    expect(formatMilestone(25000)).toBe("25K");
  });

  it("formats M for millions", () => {
    expect(formatMilestone(1_000_000)).toBe("1M");
  });
});

describe("projectGrowth", () => {
  it("returns flat projection when only one data point", () => {
    const metrics = [{ followersCount: 500, syncedAt: new Date() }];
    const result = projectGrowth(metrics, [30, 60, 90]);
    expect(result).toHaveLength(3);
    result.forEach((r) => expect(r.projected).toBe(500));
  });

  it("returns linear projection with two data points", () => {
    const now = new Date();
    const past = new Date(now.getTime() - 10 * 86400000);
    const metrics = [
      { followersCount: 900, syncedAt: past },
      { followersCount: 1000, syncedAt: now },
    ];
    const result = projectGrowth(metrics, [10]);
    expect(result[0].days).toBe(10);
    // 10 followers/day * 10 days = ~100 more = ~1100
    expect(result[0].projected).toBeGreaterThan(1000);
  });

  it("never returns negative projections", () => {
    const now = new Date();
    const past = new Date(now.getTime() - 10 * 86400000);
    const metrics = [
      { followersCount: 100, syncedAt: past },
      { followersCount: 50, syncedAt: now },
    ];
    const result = projectGrowth(metrics, [30, 60, 90]);
    result.forEach((r) => expect(r.projected).toBeGreaterThanOrEqual(0));
  });
});

describe("computeGrowthRate", () => {
  it("returns 0 for single data point", () => {
    const metrics = [{ followersCount: 500, syncedAt: new Date() }];
    expect(computeGrowthRate(metrics)).toBe(0);
  });

  it("computes correct daily growth rate", () => {
    const now = new Date();
    const past = new Date(now.getTime() - 10 * 86400000);
    const metrics = [
      { followersCount: 900, syncedAt: past },
      { followersCount: 1000, syncedAt: now },
    ];
    const rate = computeGrowthRate(metrics);
    expect(rate).toBeCloseTo(10, 0); // 10 followers/day
  });

  it("returns 0 when oldest followers count is 0", () => {
    const now = new Date();
    const past = new Date(now.getTime() - 10 * 86400000);
    const metrics = [
      { followersCount: 0, syncedAt: past },
      { followersCount: 100, syncedAt: now },
    ];
    expect(computeGrowthRate(metrics)).toBe(0);
  });
});

describe("MILESTONE_THRESHOLDS", () => {
  it("is a sorted ascending array", () => {
    for (let i = 1; i < MILESTONE_THRESHOLDS.length; i++) {
      expect(MILESTONE_THRESHOLDS[i]).toBeGreaterThan(MILESTONE_THRESHOLDS[i - 1]);
    }
  });
});
