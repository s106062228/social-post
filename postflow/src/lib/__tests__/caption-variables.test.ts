import { substituteVariables, extractPlaceholders } from "@/lib/caption-variables";

describe("substituteVariables", () => {
  it("replaces a single placeholder", () => {
    expect(
      substituteVariables("Hello {{name}}!", [{ key: "name", value: "World" }])
    ).toBe("Hello World!");
  });

  it("replaces multiple occurrences of the same placeholder", () => {
    expect(
      substituteVariables("{{brand}} is great. Love {{brand}}.", [
        { key: "brand", value: "PostFlow" },
      ])
    ).toBe("PostFlow is great. Love PostFlow.");
  });

  it("replaces multiple different placeholders", () => {
    expect(
      substituteVariables("Hi {{first}} {{last}}, welcome to {{brand}}!", [
        { key: "first", value: "Jane" },
        { key: "last", value: "Doe" },
        { key: "brand", value: "PostFlow" },
      ])
    ).toBe("Hi Jane Doe, welcome to PostFlow!");
  });

  it("leaves unknown placeholders unchanged", () => {
    expect(
      substituteVariables("Visit {{website}} today", [{ key: "other", value: "x" }])
    ).toBe("Visit {{website}} today");
  });

  it("returns content unchanged when vars array is empty", () => {
    expect(substituteVariables("Hello {{world}}", [])).toBe("Hello {{world}}");
  });

  it("handles empty content", () => {
    expect(substituteVariables("", [{ key: "x", value: "y" }])).toBe("");
  });

  it("handles content with no placeholders", () => {
    expect(substituteVariables("No placeholders here", [{ key: "x", value: "y" }])).toBe(
      "No placeholders here"
    );
  });

  it("replaces placeholder at start of content", () => {
    expect(
      substituteVariables("{{cta}} — check it out!", [{ key: "cta", value: "Buy now" }])
    ).toBe("Buy now — check it out!");
  });

  it("replaces placeholder at end of content", () => {
    expect(
      substituteVariables("Follow us at {{handle}}", [{ key: "handle", value: "@postflow" }])
    ).toBe("Follow us at @postflow");
  });

  it("handles value containing special characters", () => {
    expect(
      substituteVariables("{{url}}", [{ key: "url", value: "https://example.com?a=1&b=2" }])
    ).toBe("https://example.com?a=1&b=2");
  });
});

describe("extractPlaceholders", () => {
  it("returns empty array for content without placeholders", () => {
    expect(extractPlaceholders("No placeholders")).toEqual([]);
  });

  it("returns single placeholder key", () => {
    expect(extractPlaceholders("Hello {{name}}")).toEqual(["name"]);
  });

  it("returns multiple unique placeholder keys", () => {
    const result = extractPlaceholders("{{a}} and {{b}} and {{a}}");
    expect(result).toHaveLength(2);
    expect(result).toContain("a");
    expect(result).toContain("b");
  });

  it("returns placeholder keys with underscores and numbers", () => {
    expect(extractPlaceholders("{{brand_name_1}}")).toEqual(["brand_name_1"]);
  });

  it("does not return malformed placeholders", () => {
    expect(extractPlaceholders("{{ spaces }} and {no_braces}")).toEqual([]);
  });
});
