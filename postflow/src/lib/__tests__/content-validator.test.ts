import { validateForPlatform, validateForAllPlatforms } from "../content-validator";

describe("validateForPlatform", () => {
  describe("character limit checks", () => {
    it("returns valid for content within Twitter 280 limit", () => {
      const content = "A".repeat(280);
      const result = validateForPlatform(content, "NONE", "TWITTER");
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("returns error when content exceeds Twitter 280 limit", () => {
      const content = "A".repeat(281);
      const result = validateForPlatform(content, "NONE", "TWITTER");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("character limit"))).toBe(true);
    });

    it("returns warning when content is near (≥90%) Twitter limit", () => {
      const content = "A".repeat(253); // 253/280 = 90.36%
      const result = validateForPlatform(content, "NONE", "TWITTER");
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes("near"))).toBe(true);
    });

    it("returns valid for content within Facebook 63206 limit", () => {
      const content = "Hello world";
      const result = validateForPlatform(content, "NONE", "FACEBOOK");
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("media type support", () => {
    it("returns valid for IMAGE on INSTAGRAM", () => {
      const result = validateForPlatform("Check this out!", "IMAGE", "INSTAGRAM");
      expect(result.valid).toBe(true);
    });

    it("returns error for NONE (text-only) on INSTAGRAM", () => {
      const result = validateForPlatform("Text only", "NONE", "INSTAGRAM");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("does not support NONE"))).toBe(true);
    });

    it("returns error for VIDEO on PINTEREST", () => {
      const result = validateForPlatform("Watch this video!", "VIDEO", "PINTEREST");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("does not support VIDEO"))).toBe(true);
    });

    it("returns valid for VIDEO on YOUTUBE", () => {
      const result = validateForPlatform("My video description", "VIDEO", "YOUTUBE");
      expect(result.valid).toBe(true);
    });

    it("returns error for NONE on YOUTUBE (media required)", () => {
      const result = validateForPlatform("Just text", "NONE", "YOUTUBE");
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("returns error for NONE on PINTEREST (media required)", () => {
      const result = validateForPlatform("Just text", "NONE", "PINTEREST");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("requires media"))).toBe(true);
    });

    it("returns error for NONE on TIKTOK (media required)", () => {
      const result = validateForPlatform("Just text", "NONE", "TIKTOK");
      expect(result.valid).toBe(false);
    });
  });

  describe("URL count checks", () => {
    it("returns warning when Threads post has more than 1 URL", () => {
      const content =
        "Check https://example.com and also https://other.com for more";
      const result = validateForPlatform(content, "NONE", "THREADS");
      expect(result.warnings.some((w) => w.includes("URL"))).toBe(true);
    });

    it("no URL warning for Facebook (no URL limit)", () => {
      const content =
        "Visit https://example.com and https://other.com for more info";
      const result = validateForPlatform(content, "NONE", "FACEBOOK");
      expect(result.warnings.some((w) => w.includes("URL"))).toBe(false);
    });
  });

  describe("hashtag count checks", () => {
    it("returns warning when Instagram post has more than 30 hashtags", () => {
      const hashtags = Array.from({ length: 31 }, (_, i) => `#tag${i}`).join(
        " "
      );
      const content = `Great post ${hashtags}`;
      const result = validateForPlatform(content, "IMAGE", "INSTAGRAM");
      expect(result.warnings.some((w) => w.includes("hashtags"))).toBe(true);
    });

    it("returns no warning for exactly 30 hashtags on Instagram", () => {
      const hashtags = Array.from({ length: 30 }, (_, i) => `#tag${i}`).join(
        " "
      );
      const content = `Great post ${hashtags}`;
      const result = validateForPlatform(content, "IMAGE", "INSTAGRAM");
      expect(result.warnings.some((w) => w.includes("hashtag"))).toBe(false);
    });

    it("returns warning when Threads post has more than 10 hashtags", () => {
      const hashtags = Array.from({ length: 11 }, (_, i) => `#tag${i}`).join(
        " "
      );
      const content = `Post ${hashtags}`;
      const result = validateForPlatform(content, "NONE", "THREADS");
      expect(result.warnings.some((w) => w.includes("hashtag"))).toBe(true);
    });
  });

  describe("empty content check", () => {
    it("returns error for empty text post on FACEBOOK", () => {
      const result = validateForPlatform("", "NONE", "FACEBOOK");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("empty"))).toBe(true);
    });

    it("no empty error for IMAGE post with empty caption on FACEBOOK", () => {
      const result = validateForPlatform("", "IMAGE", "FACEBOOK");
      const hasEmptyError = result.errors.some((e) => e.includes("empty"));
      expect(hasEmptyError).toBe(false);
    });
  });
});

describe("validateForAllPlatforms", () => {
  it("returns one result per platform", () => {
    const results = validateForAllPlatforms("Hello!", "NONE", [
      "FACEBOOK",
      "TWITTER",
    ]);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.platform)).toEqual(
      expect.arrayContaining(["FACEBOOK", "TWITTER"])
    );
  });

  it("returns valid:true for well-formed content on all platforms", () => {
    const results = validateForAllPlatforms("Short tweet.", "NONE", [
      "FACEBOOK",
      "THREADS",
      "TWITTER",
    ]);
    for (const r of results) {
      expect(r.valid).toBe(true);
    }
  });

  it("returns an error for YOUTUBE when mediaType is NONE", () => {
    const results = validateForAllPlatforms("No media", "NONE", ["YOUTUBE"]);
    expect(results[0].valid).toBe(false);
  });
});
