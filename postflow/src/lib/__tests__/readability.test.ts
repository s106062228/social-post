import { analyzeReadability, readabilityLabel } from "../readability";

describe("analyzeReadability", () => {
  it("returns default values for empty string", () => {
    const result = analyzeReadability("");
    expect(result.wordCount).toBe(0);
    expect(result.sentenceCount).toBe(0);
    expect(result.fleschKincaid).toBe(100);
    expect(result.gradeLevel).toBe(0);
    expect(result.readingTimeSeconds).toBe(0);
    expect(result.label).toBe("very-easy");
  });

  it("returns default values for whitespace-only string", () => {
    const result = analyzeReadability("   ");
    expect(result.wordCount).toBe(0);
  });

  it("counts words correctly", () => {
    const result = analyzeReadability("Hello world this is a test");
    expect(result.wordCount).toBe(6);
  });

  it("counts sentences correctly for period-terminated text", () => {
    const result = analyzeReadability("This is one sentence. This is another.");
    expect(result.sentenceCount).toBe(2);
  });

  it("counts sentences split by exclamation and question marks", () => {
    const result = analyzeReadability("Wow! Really? Yes.");
    expect(result.sentenceCount).toBe(3);
  });

  it("treats content with no punctuation as one sentence", () => {
    const result = analyzeReadability("Hello world");
    expect(result.sentenceCount).toBe(1);
  });

  it("calculates avgWordsPerSentence", () => {
    const result = analyzeReadability("One two three. Four five six.");
    expect(result.avgWordsPerSentence).toBe(3);
  });

  it("produces a lower FK score for complex academic text", () => {
    const simple = analyzeReadability("The cat sat. The dog ran. It was fun.");
    const complex = analyzeReadability(
      "Contemporary epistemological investigations demonstrate the philosophical insufficiency of positivist methodological frameworks for comprehending multidimensional phenomenological structures."
    );
    expect(simple.fleschKincaid).toBeGreaterThan(complex.fleschKincaid);
  });

  it("reading time is at least 1 second for non-empty content", () => {
    const result = analyzeReadability("Hello");
    expect(result.readingTimeSeconds).toBeGreaterThanOrEqual(1);
  });

  it("reading time scales with word count (200 wpm)", () => {
    // 200 words = 60 seconds
    const words = Array(200).fill("word").join(" ");
    const result = analyzeReadability(words);
    expect(result.readingTimeSeconds).toBe(60);
  });

  it("FK score is clamped to [0, 100]", () => {
    const result = analyzeReadability("a");
    expect(result.fleschKincaid).toBeGreaterThanOrEqual(0);
    expect(result.fleschKincaid).toBeLessThanOrEqual(100);
  });
});

describe("readabilityLabel", () => {
  it("returns 'very-easy' for score >= 70", () => {
    expect(readabilityLabel(70)).toBe("very-easy");
    expect(readabilityLabel(100)).toBe("very-easy");
    expect(readabilityLabel(80)).toBe("very-easy");
  });

  it("returns 'easy' for score 55–69", () => {
    expect(readabilityLabel(55)).toBe("easy");
    expect(readabilityLabel(69)).toBe("easy");
  });

  it("returns 'medium' for score 40–54", () => {
    expect(readabilityLabel(40)).toBe("medium");
    expect(readabilityLabel(54)).toBe("medium");
  });

  it("returns 'hard' for score 25–39", () => {
    expect(readabilityLabel(25)).toBe("hard");
    expect(readabilityLabel(39)).toBe("hard");
  });

  it("returns 'very-hard' for score < 25", () => {
    expect(readabilityLabel(0)).toBe("very-hard");
    expect(readabilityLabel(24)).toBe("very-hard");
  });
});
