import { computeDiff, diffStats } from "../text-diff";

describe("computeDiff", () => {
  it("returns empty array for two empty strings", () => {
    expect(computeDiff("", "")).toEqual([]);
  });

  it("marks all tokens as added when before is empty", () => {
    const result = computeDiff("", "hello world");
    const types = result.map((c) => c.type);
    expect(types.every((t) => t === "added")).toBe(true);
    const joined = result.map((c) => c.text).join("");
    expect(joined).toBe("hello world");
  });

  it("marks all tokens as removed when after is empty", () => {
    const result = computeDiff("hello world", "");
    const types = result.map((c) => c.type);
    expect(types.every((t) => t === "removed")).toBe(true);
    const joined = result.map((c) => c.text).join("");
    expect(joined).toBe("hello world");
  });

  it("returns unchanged for identical strings", () => {
    const result = computeDiff("hello world", "hello world");
    expect(result.every((c) => c.type === "unchanged")).toBe(true);
  });

  it("detects a simple word substitution", () => {
    const result = computeDiff("hello world", "hello earth");
    const removed = result.filter((c) => c.type === "removed");
    const added = result.filter((c) => c.type === "added");
    expect(removed.some((c) => c.text.includes("world"))).toBe(true);
    expect(added.some((c) => c.text.includes("earth"))).toBe(true);
  });

  it("detects an appended word", () => {
    const result = computeDiff("hello", "hello world");
    const added = result.filter((c) => c.type === "added");
    expect(added.some((c) => c.text.includes("world"))).toBe(true);
    const unchanged = result.filter((c) => c.type === "unchanged");
    expect(unchanged.some((c) => c.text.includes("hello"))).toBe(true);
  });

  it("detects a removed word", () => {
    const result = computeDiff("hello world", "hello");
    const removed = result.filter((c) => c.type === "removed");
    expect(removed.some((c) => c.text.includes("world"))).toBe(true);
  });

  it("produces correct full reconstruction for added chunks", () => {
    const before = "the quick brown fox";
    const after = "the quick brown fox jumps over";
    const result = computeDiff(before, after);
    const reconstructed = result.map((c) => c.text).join("");
    // After reconstruction should contain all of "after"
    // The removed parts together with unchanged parts reconstruct "before"
    const afterReconstructed = result
      .filter((c) => c.type !== "removed")
      .map((c) => c.text)
      .join("");
    expect(afterReconstructed).toBe(after);
  });

  it("produces correct reconstruction — before from unchanged+removed", () => {
    const before = "buy our amazing product today";
    const after = "buy our fantastic product now";
    const result = computeDiff(before, after);
    const beforeReconstructed = result
      .filter((c) => c.type !== "added")
      .map((c) => c.text)
      .join("");
    expect(beforeReconstructed).toBe(before);
  });

  it("handles multiline text", () => {
    const before = "line one\nline two\nline three";
    const after = "line one\nline CHANGED\nline three";
    const result = computeDiff(before, after);
    const hasRemoved = result.some(
      (c) => c.type === "removed" && c.text.includes("two")
    );
    const hasAdded = result.some(
      (c) => c.type === "added" && c.text.includes("CHANGED")
    );
    expect(hasRemoved).toBe(true);
    expect(hasAdded).toBe(true);
  });
});

describe("diffStats", () => {
  it("returns zero counts for empty diff", () => {
    const stats = diffStats([]);
    expect(stats).toEqual({ added: 0, removed: 0, unchanged: 0 });
  });

  it("counts added words correctly", () => {
    const stats = diffStats([{ type: "added", text: "hello world" }]);
    expect(stats.added).toBe(2);
    expect(stats.removed).toBe(0);
    expect(stats.unchanged).toBe(0);
  });

  it("counts removed words correctly", () => {
    const stats = diffStats([{ type: "removed", text: "foo bar baz" }]);
    expect(stats.removed).toBe(3);
  });

  it("counts unchanged words correctly", () => {
    const stats = diffStats([{ type: "unchanged", text: "keep this text" }]);
    expect(stats.unchanged).toBe(3);
  });

  it("counts mixed diff correctly", () => {
    const stats = diffStats([
      { type: "unchanged", text: "hello " },
      { type: "removed", text: "world" },
      { type: "added", text: "earth everyone" },
    ]);
    expect(stats.unchanged).toBe(1);
    expect(stats.removed).toBe(1);
    expect(stats.added).toBe(2);
  });

  it("ignores whitespace-only tokens", () => {
    const stats = diffStats([{ type: "added", text: "   " }]);
    expect(stats.added).toBe(0);
  });
});
