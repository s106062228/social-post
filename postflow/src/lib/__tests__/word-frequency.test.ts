import { computeWordFrequency } from "../word-frequency";

describe("computeWordFrequency", () => {
  it("returns empty array for empty input", () => {
    expect(computeWordFrequency([])).toEqual([]);
  });

  it("returns empty array for texts with only stop words", () => {
    const result = computeWordFrequency(["the quick brown fox", "a and or but"]);
    // 'quick', 'brown', 'fox' are not stop words
    const texts = result.map((w) => w.text);
    expect(texts).not.toContain("the");
    expect(texts).not.toContain("a");
    expect(texts).not.toContain("and");
    expect(texts).not.toContain("or");
    expect(texts).not.toContain("but");
  });

  it("counts word frequency correctly", () => {
    const result = computeWordFrequency(["hello world", "hello planet"]);
    const hello = result.find((w) => w.text === "hello");
    const world = result.find((w) => w.text === "world");
    const planet = result.find((w) => w.text === "planet");
    expect(hello?.count).toBe(2);
    expect(world?.count).toBe(1);
    expect(planet?.count).toBe(1);
  });

  it("sorts by count descending", () => {
    // marketing×3, strategy×1, digital×1, tips×1
    const result = computeWordFrequency([
      "marketing marketing marketing strategy",
      "digital tips",
    ]);
    expect(result[0]?.text).toBe("marketing");
    expect(result[0]?.count).toBe(3);
    // strategy, digital, tips all have count 1 — any order is fine
    const rest = result.slice(1).map((w) => w.count);
    rest.forEach((c) => expect(c).toBe(1));
  });

  it("strips URLs from content", () => {
    const result = computeWordFrequency(["check https://example.com/path out"]);
    const texts = result.map((w) => w.text);
    expect(texts).not.toContain("https");
    expect(texts).not.toContain("example");
    expect(texts).toContain("check");
  });

  it("strips @ mentions", () => {
    const result = computeWordFrequency(["hello @johndoe welcome"]);
    const texts = result.map((w) => w.text);
    expect(texts).not.toContain("@johndoe");
    expect(texts).not.toContain("johndoe");
    expect(texts).toContain("hello");
    expect(texts).toContain("welcome");
  });

  it("strips # symbol but keeps hashtag text", () => {
    const result = computeWordFrequency(["great #socialmedia post"]);
    const texts = result.map((w) => w.text);
    expect(texts).not.toContain("#socialmedia");
    expect(texts).toContain("socialmedia");
  });

  it("is case-insensitive", () => {
    const result = computeWordFrequency(["Hello HELLO hello"]);
    const hello = result.find((w) => w.text === "hello");
    expect(hello?.count).toBe(3);
  });

  it("ignores single-character tokens", () => {
    const result = computeWordFrequency(["a b c marketing"]);
    const texts = result.map((w) => w.text);
    expect(texts).not.toContain("b");
    expect(texts).not.toContain("c");
    expect(texts).toContain("marketing");
  });

  it("ignores pure numbers", () => {
    const result = computeWordFrequency(["2024 was great", "100 percent success"]);
    const texts = result.map((w) => w.text);
    expect(texts).not.toContain("2024");
    expect(texts).not.toContain("100");
    expect(texts).toContain("great");
    expect(texts).toContain("percent");
    expect(texts).toContain("success");
  });

  it("respects the limit parameter", () => {
    const texts = Array.from({ length: 20 }, (_, i) => `word${i} word${i} word${i}`);
    const result = computeWordFrequency(texts, 5);
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it("handles multiple posts", () => {
    const posts = [
      "content marketing strategy",
      "digital marketing tips",
      "marketing strategy guide",
    ];
    const result = computeWordFrequency(posts);
    const marketing = result.find((w) => w.text === "marketing");
    const strategy = result.find((w) => w.text === "strategy");
    expect(marketing?.count).toBe(3);
    expect(strategy?.count).toBe(2);
  });
});
