import {
  PLATFORM_CHAR_LIMITS,
  getCharacterInfo,
  getStrictestLimit,
  isContentOverLimitForAny,
} from "../character-limits";

describe("PLATFORM_CHAR_LIMITS", () => {
  it("defines correct limit for Facebook", () => {
    expect(PLATFORM_CHAR_LIMITS.FACEBOOK).toBe(63206);
  });

  it("defines correct limit for Instagram", () => {
    expect(PLATFORM_CHAR_LIMITS.INSTAGRAM).toBe(2200);
  });

  it("defines correct limit for Threads", () => {
    expect(PLATFORM_CHAR_LIMITS.THREADS).toBe(500);
  });
});

describe("getCharacterInfo", () => {
  it("returns zero count for empty string", () => {
    const info = getCharacterInfo("", "THREADS");
    expect(info.count).toBe(0);
    expect(info.remaining).toBe(500);
    expect(info.isOverLimit).toBe(false);
    expect(info.percentage).toBe(0);
  });

  it("counts characters correctly", () => {
    const info = getCharacterInfo("Hello world", "THREADS");
    expect(info.count).toBe(11);
    expect(info.remaining).toBe(489);
    expect(info.limit).toBe(500);
    expect(info.isOverLimit).toBe(false);
  });

  it("is not over limit at exact limit", () => {
    const content = "a".repeat(500);
    const info = getCharacterInfo(content, "THREADS");
    expect(info.isOverLimit).toBe(false);
    expect(info.remaining).toBe(0);
    expect(info.percentage).toBe(100);
  });

  it("detects over limit for Threads", () => {
    const content = "a".repeat(501);
    const info = getCharacterInfo(content, "THREADS");
    expect(info.isOverLimit).toBe(true);
    expect(info.remaining).toBe(-1);
  });

  it("detects over limit for Instagram", () => {
    const content = "a".repeat(2201);
    const info = getCharacterInfo(content, "INSTAGRAM");
    expect(info.isOverLimit).toBe(true);
    expect(info.remaining).toBe(-1);
  });

  it("content within Instagram limit is not over limit", () => {
    const content = "a".repeat(501);
    const info = getCharacterInfo(content, "INSTAGRAM");
    expect(info.isOverLimit).toBe(false);
  });

  it("calculates 50% percentage correctly", () => {
    const content = "a".repeat(250);
    const info = getCharacterInfo(content, "THREADS");
    expect(info.percentage).toBe(50);
  });

  it("caps percentage at 100 when over limit", () => {
    const content = "a".repeat(1000);
    const info = getCharacterInfo(content, "THREADS");
    expect(info.percentage).toBe(100);
  });

  it("handles Facebook limit correctly", () => {
    const content = "a".repeat(63206);
    const info = getCharacterInfo(content, "FACEBOOK");
    expect(info.isOverLimit).toBe(false);
    expect(info.remaining).toBe(0);
  });
});

describe("getStrictestLimit", () => {
  it("returns null for empty platforms array", () => {
    expect(getStrictestLimit([])).toBeNull();
  });

  it("returns Threads limit as strictest when all three selected", () => {
    expect(getStrictestLimit(["FACEBOOK", "INSTAGRAM", "THREADS"])).toBe(500);
  });

  it("returns Instagram limit when FB and IG selected", () => {
    expect(getStrictestLimit(["FACEBOOK", "INSTAGRAM"])).toBe(2200);
  });

  it("returns Facebook limit when only FB selected", () => {
    expect(getStrictestLimit(["FACEBOOK"])).toBe(63206);
  });

  it("returns Threads limit when only Threads selected", () => {
    expect(getStrictestLimit(["THREADS"])).toBe(500);
  });
});

describe("isContentOverLimitForAny", () => {
  it("returns false for empty content", () => {
    expect(
      isContentOverLimitForAny("", ["FACEBOOK", "INSTAGRAM", "THREADS"])
    ).toBe(false);
  });

  it("returns false for short content within all limits", () => {
    expect(
      isContentOverLimitForAny("Hello world", ["FACEBOOK", "INSTAGRAM", "THREADS"])
    ).toBe(false);
  });

  it("returns true when content exceeds Threads limit", () => {
    const content = "a".repeat(501);
    expect(
      isContentOverLimitForAny(content, ["FACEBOOK", "INSTAGRAM", "THREADS"])
    ).toBe(true);
  });

  it("returns false when content is under Threads limit for Threads only", () => {
    const content = "a".repeat(300);
    expect(isContentOverLimitForAny(content, ["THREADS"])).toBe(false);
  });

  it("returns true for Instagram over limit", () => {
    const content = "a".repeat(2201);
    expect(isContentOverLimitForAny(content, ["INSTAGRAM"])).toBe(true);
  });

  it("returns false for same content against Facebook only", () => {
    const content = "a".repeat(2201);
    expect(isContentOverLimitForAny(content, ["FACEBOOK"])).toBe(false);
  });

  it("returns false for empty platforms array", () => {
    expect(isContentOverLimitForAny("a".repeat(9999), [])).toBe(false);
  });
});
