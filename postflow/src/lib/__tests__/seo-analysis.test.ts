import { analyzeSeo, seoScoreColor } from "../seo-analysis";

// Helper: build content with n short sentences totalling ≥50 words
function longContent(opts: {
  hashtags?: number;
  url?: boolean;
  cta?: boolean;
  sentences?: number;
} = {}) {
  const { hashtags = 0, url = false, cta = false, sentences = 8 } = opts;
  const parts: string[] = [];
  for (let i = 0; i < sentences; i++) {
    parts.push(`This is sentence number ${i + 1} with some words.`);
  }
  if (url) parts.push("Visit https://example.com for more.");
  if (cta) parts.push("Sign up today to get started.");
  for (let h = 0; h < hashtags; h++) parts.push(`#hashtag${h}`);
  return parts.join(" ");
}

describe("analyzeSeo", () => {
  it("returns Needs Work label for empty content", () => {
    const result = analyzeSeo("");
    // 2 checks vacuously pass (no hashtags = not excessive; 0 avg words = readable)
    expect(result.score).toBe(33);
    expect(result.label).toBe("Needs Work");
    expect(result.checks).toHaveLength(6);
  });

  it("fails min_length check for short content", () => {
    const result = analyzeSeo("Hello world.");
    const check = result.checks.find((c) => c.id === "min_length");
    expect(check?.passed).toBe(false);
  });

  it("passes min_length check for content with ≥50 words", () => {
    const content = longContent({ sentences: 8 });
    const result = analyzeSeo(content);
    const check = result.checks.find((c) => c.id === "min_length");
    expect(check?.passed).toBe(true);
  });

  it("passes hashtags_present when hashtag is included", () => {
    const result = analyzeSeo("Check out this post #awesome");
    const check = result.checks.find((c) => c.id === "hashtags_present");
    expect(check?.passed).toBe(true);
  });

  it("fails hashtags_present when no hashtag is included", () => {
    const result = analyzeSeo("No hashtags here at all.");
    const check = result.checks.find((c) => c.id === "hashtags_present");
    expect(check?.passed).toBe(false);
  });

  it("passes hashtags_not_excessive for exactly 10 hashtags", () => {
    const hashtags = Array.from({ length: 10 }, (_, i) => `#tag${i}`).join(" ");
    const result = analyzeSeo(`Content ${hashtags}`);
    const check = result.checks.find((c) => c.id === "hashtags_not_excessive");
    expect(check?.passed).toBe(true);
  });

  it("fails hashtags_not_excessive for 11 hashtags", () => {
    const hashtags = Array.from({ length: 11 }, (_, i) => `#tag${i}`).join(" ");
    const result = analyzeSeo(`Content ${hashtags}`);
    const check = result.checks.find((c) => c.id === "hashtags_not_excessive");
    expect(check?.passed).toBe(false);
  });

  it("passes has_link when URL is present", () => {
    const result = analyzeSeo("Visit https://example.com for more.");
    const check = result.checks.find((c) => c.id === "has_link");
    expect(check?.passed).toBe(true);
  });

  it("fails has_link when no URL is present", () => {
    const result = analyzeSeo("No link here.");
    const check = result.checks.find((c) => c.id === "has_link");
    expect(check?.passed).toBe(false);
  });

  it("passes readable_sentences for short avg sentence length", () => {
    const result = analyzeSeo("Short sentence. Another short one. Yes indeed.");
    const check = result.checks.find((c) => c.id === "readable_sentences");
    expect(check?.passed).toBe(true);
  });

  it("fails readable_sentences when avg words per sentence >20", () => {
    // one very long sentence
    const words = Array.from({ length: 25 }, (_, i) => `word${i}`).join(" ");
    const result = analyzeSeo(`${words}.`);
    const check = result.checks.find((c) => c.id === "readable_sentences");
    expect(check?.passed).toBe(false);
  });

  it("passes engagement_trigger for question mark", () => {
    const result = analyzeSeo("What do you think about this?");
    const check = result.checks.find((c) => c.id === "engagement_trigger");
    expect(check?.passed).toBe(true);
  });

  it("passes engagement_trigger for CTA keyword", () => {
    const result = analyzeSeo("Sign up for our newsletter today.");
    const check = result.checks.find((c) => c.id === "engagement_trigger");
    expect(check?.passed).toBe(true);
  });

  it("fails engagement_trigger when no CTA or question", () => {
    const result = analyzeSeo("This is a plain statement with nothing special.");
    const check = result.checks.find((c) => c.id === "engagement_trigger");
    expect(check?.passed).toBe(false);
  });

  it("score is 100 when all checks pass", () => {
    // 8 short sentences gives ≥50 words, avg ≤20 words/sentence
    const content = longContent({ sentences: 8, hashtags: 1, url: true, cta: true });
    const result = analyzeSeo(content);
    expect(result.score).toBe(100);
    expect(result.label).toBe("Excellent");
  });

  it("returns Excellent label for score ≥84", () => {
    // 5/6 = 83% → Fair; 6/6 = 100% → Excellent. Need ≥5 passing for ≥84
    const content = longContent({ sentences: 8, hashtags: 1, url: true, cta: true });
    const result = analyzeSeo(content);
    expect(result.score).toBeGreaterThanOrEqual(84);
    expect(result.label).toBe("Excellent");
  });

  it("score is proportional to passed checks", () => {
    const result = analyzeSeo("Visit https://example.com?");
    const passedCount = result.checks.filter((c) => c.passed).length;
    expect(result.score).toBe(Math.round((passedCount / result.checks.length) * 100));
  });
});

describe("seoScoreColor", () => {
  it("returns green for score ≥84", () => {
    expect(seoScoreColor(100)).toBe("text-green-600");
    expect(seoScoreColor(84)).toBe("text-green-600");
  });

  it("returns yellow for score 67–83", () => {
    expect(seoScoreColor(67)).toBe("text-yellow-600");
    expect(seoScoreColor(83)).toBe("text-yellow-600");
  });

  it("returns orange for score 50–66", () => {
    expect(seoScoreColor(50)).toBe("text-orange-500");
    expect(seoScoreColor(66)).toBe("text-orange-500");
  });

  it("returns red for score <50", () => {
    expect(seoScoreColor(0)).toBe("text-red-600");
    expect(seoScoreColor(49)).toBe("text-red-600");
  });
});
