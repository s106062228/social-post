import {
  isPostDraggable,
  computeNewScheduledAt,
  parseDayDropId,
} from "../calendar-reschedule";

describe("isPostDraggable", () => {
  it("returns true for SCHEDULED status", () => {
    expect(isPostDraggable("SCHEDULED")).toBe(true);
  });

  it("returns true for DRAFT status", () => {
    expect(isPostDraggable("DRAFT")).toBe(true);
  });

  it("returns false for PUBLISHED status", () => {
    expect(isPostDraggable("PUBLISHED")).toBe(false);
  });

  it("returns false for PUBLISHING status", () => {
    expect(isPostDraggable("PUBLISHING")).toBe(false);
  });

  it("returns false for FAILED status", () => {
    expect(isPostDraggable("FAILED")).toBe(false);
  });

  it("returns false for unknown status", () => {
    expect(isPostDraggable("UNKNOWN")).toBe(false);
  });
});

describe("computeNewScheduledAt", () => {
  it("preserves the original time of day when changing date", () => {
    // 2026-05-22 at 10:30 UTC
    const original = "2026-05-22T10:30:00.000Z";
    const result = computeNewScheduledAt(original, 2026, 4, 28); // month is 0-indexed
    expect(result.getHours()).toBe(10);
    expect(result.getMinutes()).toBe(30);
    expect(result.getDate()).toBe(28);
  });

  it("sets seconds and milliseconds to zero", () => {
    const original = "2026-05-22T14:45:30.500Z";
    const result = computeNewScheduledAt(original, 2026, 5, 1);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });

  it("correctly sets target year, month, and day", () => {
    const original = "2026-01-01T08:00:00.000Z";
    const result = computeNewScheduledAt(original, 2027, 11, 31);
    expect(result.getFullYear()).toBe(2027);
    expect(result.getMonth()).toBe(11); // December
    expect(result.getDate()).toBe(31);
  });

  it("handles midnight posts (00:00)", () => {
    const original = "2026-05-22T00:00:00.000Z";
    const result = computeNewScheduledAt(original, 2026, 5, 15);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
  });
});

describe("parseDayDropId", () => {
  it("parses a valid day drop id", () => {
    const result = parseDayDropId("day-2026-4-22");
    expect(result).toEqual({ year: 2026, month: 4, day: 22 });
  });

  it("returns null for non-day ids", () => {
    expect(parseDayDropId("empty-0")).toBeNull();
    expect(parseDayDropId("post-abc123")).toBeNull();
  });

  it("returns null for malformed ids", () => {
    expect(parseDayDropId("day")).toBeNull();
    expect(parseDayDropId("day-2026")).toBeNull();
    expect(parseDayDropId("day-2026-4")).toBeNull();
  });

  it("returns null when year is not a number", () => {
    expect(parseDayDropId("day-XXXX-4-22")).toBeNull();
  });

  it("returns null when day is not a number", () => {
    expect(parseDayDropId("day-2026-4-XX")).toBeNull();
  });

  it("parses day 1 of month 0 (January)", () => {
    const result = parseDayDropId("day-2026-0-1");
    expect(result).toEqual({ year: 2026, month: 0, day: 1 });
  });
});
