import { tokenize, computeSimilarity } from "../similarity";

describe("tokenize", () => {
  it("returns a Set of lowercase tokens", () => {
    const result = tokenize("Hello World");
    expect(result.has("hello")).toBe(true);
    expect(result.has("world")).toBe(true);
  });

  it("strips punctuation", () => {
    const result = tokenize("Hello, world!");
    expect(result.has("hello")).toBe(true);
    expect(result.has("world")).toBe(true);
  });

  it("filters stop words", () => {
    const result = tokenize("the cat sat on the mat");
    expect(result.has("the")).toBe(false);
    expect(result.has("on")).toBe(false);
    expect(result.has("cat")).toBe(true);
    expect(result.has("sat")).toBe(true);
    expect(result.has("mat")).toBe(true);
  });

  it("filters tokens with 2 or fewer characters", () => {
    const result = tokenize("I am a big fan of AI");
    // short words and stop words are filtered
    expect(result.has("big")).toBe(true);
    expect(result.has("fan")).toBe(true);
  });

  it("returns empty set for empty string", () => {
    expect(tokenize("").size).toBe(0);
  });

  it("deduplicates repeated tokens", () => {
    const result = tokenize("apple apple apple banana");
    expect(result.size).toBe(2);
  });
});

describe("computeSimilarity", () => {
  it("returns 1 for identical strings", () => {
    expect(computeSimilarity("hello world foo", "hello world foo")).toBe(1);
  });

  it("returns 0 for completely different strings", () => {
    const score = computeSimilarity("apple banana cherry", "delta echo foxtrot");
    expect(score).toBe(0);
  });

  it("returns a value between 0 and 1 for partially similar strings", () => {
    const score = computeSimilarity(
      "buy our amazing product today",
      "buy our fantastic product now"
    );
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it("scores above threshold for near-duplicate content", () => {
    const a = "Exciting news about our summer sale starting this weekend";
    const b = "Exciting news about our summer sale starting next weekend";
    expect(computeSimilarity(a, b)).toBeGreaterThanOrEqual(0.4);
  });

  it("returns 1 when both strings are empty (both have empty token sets)", () => {
    expect(computeSimilarity("", "")).toBe(1);
  });

  it("returns 0 when one string is empty", () => {
    expect(computeSimilarity("hello world content", "")).toBe(0);
  });

  it("is symmetric", () => {
    const a = "launching new product feature announcement";
    const b = "announcing launch of new product today";
    expect(computeSimilarity(a, b)).toBeCloseTo(computeSimilarity(b, a), 5);
  });
});
