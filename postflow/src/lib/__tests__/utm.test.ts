import { appendUtmParams, extractUrls, tagContentUrls, type UtmParams } from "@/lib/utm";

const BASE_PARAMS: UtmParams = {
  source: "facebook",
  medium: "social",
  campaign: "summer_sale",
  content: "post_link",
  term: null,
};

const MINIMAL_PARAMS: UtmParams = {
  source: "twitter",
  medium: "social",
};

// ── appendUtmParams ───────────────────────────────────────────────────────────

describe("appendUtmParams", () => {
  it("appends all provided utm params to a URL", () => {
    const result = appendUtmParams("https://example.com/page", BASE_PARAMS);
    const url = new URL(result);
    expect(url.searchParams.get("utm_source")).toBe("facebook");
    expect(url.searchParams.get("utm_medium")).toBe("social");
    expect(url.searchParams.get("utm_campaign")).toBe("summer_sale");
    expect(url.searchParams.get("utm_content")).toBe("post_link");
    expect(url.searchParams.has("utm_term")).toBe(false);
  });

  it("omits optional params when null or undefined", () => {
    const result = appendUtmParams("https://example.com", MINIMAL_PARAMS);
    const url = new URL(result);
    expect(url.searchParams.get("utm_source")).toBe("twitter");
    expect(url.searchParams.get("utm_medium")).toBe("social");
    expect(url.searchParams.has("utm_campaign")).toBe(false);
    expect(url.searchParams.has("utm_content")).toBe(false);
    expect(url.searchParams.has("utm_term")).toBe(false);
  });

  it("preserves existing query params on the URL", () => {
    const result = appendUtmParams("https://example.com/shop?ref=nav", MINIMAL_PARAMS);
    const url = new URL(result);
    expect(url.searchParams.get("ref")).toBe("nav");
    expect(url.searchParams.get("utm_source")).toBe("twitter");
  });

  it("returns original URL unchanged when it is invalid", () => {
    const result = appendUtmParams("not-a-url", BASE_PARAMS);
    expect(result).toBe("not-a-url");
  });

  it("appends term when provided", () => {
    const result = appendUtmParams("https://example.com", {
      ...MINIMAL_PARAMS,
      term: "buy now",
    });
    const url = new URL(result);
    expect(url.searchParams.get("utm_term")).toBe("buy now");
  });
});

// ── extractUrls ───────────────────────────────────────────────────────────────

describe("extractUrls", () => {
  it("extracts a single URL", () => {
    const urls = extractUrls("Check this out: https://example.com/page");
    expect(urls).toEqual(["https://example.com/page"]);
  });

  it("extracts multiple URLs", () => {
    const urls = extractUrls(
      "Visit https://example.com and https://other.org/path for more."
    );
    expect(urls).toHaveLength(2);
    expect(urls[0]).toBe("https://example.com");
    expect(urls[1]).toBe("https://other.org/path");
  });

  it("deduplicates repeated URLs", () => {
    const urls = extractUrls(
      "See https://example.com — also https://example.com again!"
    );
    expect(urls).toHaveLength(1);
    expect(urls[0]).toBe("https://example.com");
  });

  it("returns empty array when no URLs present", () => {
    expect(extractUrls("No links here.")).toEqual([]);
    expect(extractUrls("")).toEqual([]);
  });

  it("extracts http and https URLs", () => {
    const urls = extractUrls("http://insecure.com and https://secure.com");
    expect(urls).toHaveLength(2);
  });
});

// ── tagContentUrls ────────────────────────────────────────────────────────────

describe("tagContentUrls", () => {
  it("replaces all URLs in content with UTM-tagged versions", () => {
    const content = "Check https://example.com for details!";
    const tagged = tagContentUrls(content, MINIMAL_PARAMS);
    expect(tagged).toContain("utm_source=twitter");
    expect(tagged).toContain("utm_medium=social");
    expect(tagged).not.toContain("https://example.com for");
  });

  it("returns unchanged content when no URLs present", () => {
    const content = "No links in this post.";
    expect(tagContentUrls(content, MINIMAL_PARAMS)).toBe(content);
  });

  it("tags multiple distinct URLs independently", () => {
    const content = "Go to https://site1.com or https://site2.com today.";
    const tagged = tagContentUrls(content, BASE_PARAMS);
    const urls = extractUrls(tagged);
    expect(urls).toHaveLength(2);
    for (const url of urls) {
      const parsed = new URL(url);
      expect(parsed.searchParams.get("utm_source")).toBe("facebook");
      expect(parsed.searchParams.get("utm_medium")).toBe("social");
    }
  });
});
