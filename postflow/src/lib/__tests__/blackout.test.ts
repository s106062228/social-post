import { isInBlackout } from "@/lib/blackout";

const now = new Date("2026-12-25T12:00:00Z");

const xmasStart = new Date("2026-12-24T00:00:00Z");
const xmasEnd = new Date("2026-12-26T23:59:59Z");

const nonRecurring = {
  name: "Christmas Break",
  startDate: xmasStart,
  endDate: xmasEnd,
  isRecurring: false,
  daysOfWeek: [],
};

// 2026-12-25 is a Friday (dow=5)
const weekendBlackout = {
  name: "Weekend",
  startDate: new Date("2026-01-01T00:00:00Z"),
  endDate: new Date("2026-12-31T23:59:59Z"),
  isRecurring: true,
  daysOfWeek: [0, 6], // Sun + Sat
};

describe("isInBlackout", () => {
  it("returns null for empty periods list", () => {
    expect(isInBlackout(now, [])).toBeNull();
  });

  it("returns period name when date is within non-recurring range", () => {
    expect(isInBlackout(now, [nonRecurring])).toBe("Christmas Break");
  });

  it("returns null when date is before non-recurring range", () => {
    const before = new Date("2026-12-23T12:00:00Z");
    expect(isInBlackout(before, [nonRecurring])).toBeNull();
  });

  it("returns null when date is after non-recurring range", () => {
    const after = new Date("2026-12-27T12:00:00Z");
    expect(isInBlackout(after, [nonRecurring])).toBeNull();
  });

  it("returns period name for start boundary (inclusive)", () => {
    expect(isInBlackout(xmasStart, [nonRecurring])).toBe("Christmas Break");
  });

  it("returns period name for end boundary (inclusive)", () => {
    expect(isInBlackout(xmasEnd, [nonRecurring])).toBe("Christmas Break");
  });

  it("returns null for recurring when day-of-week not in list", () => {
    // 2026-12-25 is Friday (dow=5), blackout is Sat+Sun
    expect(isInBlackout(now, [weekendBlackout])).toBeNull();
  });

  it("returns period name for recurring when day-of-week matches", () => {
    const saturday = new Date("2026-12-26T12:00:00Z"); // Saturday dow=6
    expect(isInBlackout(saturday, [weekendBlackout])).toBe("Weekend");
  });

  it("returns first matching period name when multiple match", () => {
    const result = isInBlackout(now, [nonRecurring, weekendBlackout]);
    // Christmas Break matches; Weekend doesn't (Friday)
    expect(result).toBe("Christmas Break");
  });

  it("checks recurring blackout correctly for Sunday", () => {
    const sunday = new Date("2026-12-27T12:00:00Z"); // Sunday dow=0
    expect(isInBlackout(sunday, [weekendBlackout])).toBe("Weekend");
  });
});
