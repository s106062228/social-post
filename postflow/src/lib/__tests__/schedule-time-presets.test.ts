import {
  findNextOccurrence,
  formatPresetLabel,
  toDatetimeLocal,
  type TimePreset,
} from "../schedule-time-presets";

const basePreset: TimePreset = {
  id: "p1",
  name: "Test",
  hour: 12,
  minute: 0,
  daysOfWeek: [],
  timezone: "UTC",
};

describe("formatPresetLabel", () => {
  it("formats AM time with any-day when daysOfWeek is empty", () => {
    const label = formatPresetLabel({ ...basePreset, hour: 9, minute: 30 });
    expect(label).toContain("9:30 AM");
    expect(label).toContain("any day");
  });

  it("formats PM time correctly", () => {
    const label = formatPresetLabel({ ...basePreset, hour: 15, minute: 0 });
    expect(label).toContain("3:00 PM");
  });

  it("formats midnight as 12:00 AM", () => {
    const label = formatPresetLabel({ ...basePreset, hour: 0, minute: 0 });
    expect(label).toContain("12:00 AM");
  });

  it("formats noon as 12:00 PM", () => {
    const label = formatPresetLabel({ ...basePreset, hour: 12, minute: 0 });
    expect(label).toContain("12:00 PM");
  });

  it("pads minutes with leading zero", () => {
    const label = formatPresetLabel({ ...basePreset, hour: 9, minute: 5 });
    expect(label).toContain("9:05 AM");
  });

  it("lists selected days", () => {
    const label = formatPresetLabel({
      ...basePreset,
      daysOfWeek: [1, 3, 5],
    });
    expect(label).toContain("Mon");
    expect(label).toContain("Wed");
    expect(label).toContain("Fri");
    expect(label).not.toContain("any day");
  });

  it("lists all seven days when all selected", () => {
    const label = formatPresetLabel({
      ...basePreset,
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    });
    expect(label).toContain("Sun");
    expect(label).toContain("Sat");
  });
});

describe("toDatetimeLocal", () => {
  it("formats date as YYYY-MM-DDTHH:mm", () => {
    const d = new Date(2026, 0, 15, 9, 30); // Jan 15 2026 09:30 local
    const result = toDatetimeLocal(d);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(result).toContain("2026-01-15");
    expect(result).toContain("T09:30");
  });

  it("pads months and days with leading zeros", () => {
    const d = new Date(2026, 2, 5, 8, 5); // Mar 5 2026 08:05
    const result = toDatetimeLocal(d);
    expect(result).toContain("2026-03-05");
    expect(result).toContain("T08:05");
  });
});

describe("findNextOccurrence", () => {
  it("returns a future date", () => {
    const result = findNextOccurrence(basePreset);
    if (result) {
      expect(result.getTime()).toBeGreaterThan(Date.now());
    }
  });

  it("finds a match when all days are allowed", () => {
    const result = findNextOccurrence({
      ...basePreset,
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    });
    expect(result).not.toBeNull();
    if (result) {
      expect(result.getTime()).toBeGreaterThan(Date.now() + 4 * 60 * 1000);
    }
  });

  it("returns null or Date — never throws", () => {
    expect(() =>
      findNextOccurrence({ ...basePreset, hour: 23, minute: 59 })
    ).not.toThrow();
  });

  it("returns null or Date for far-future time on empty days", () => {
    const result = findNextOccurrence({
      ...basePreset,
      hour: 23,
      minute: 59,
      daysOfWeek: [],
    });
    expect(result === null || result instanceof Date).toBe(true);
  });
});
