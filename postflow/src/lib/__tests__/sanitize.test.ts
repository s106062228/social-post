import { sanitizePostContent } from "../sanitize";

describe("sanitizePostContent", () => {
  it("passes through clean plain text unchanged", () => {
    expect(sanitizePostContent("Hello, world!")).toBe("Hello, world!");
  });

  it("preserves newlines in multi-line content", () => {
    expect(sanitizePostContent("Line 1\nLine 2\nLine 3")).toBe(
      "Line 1\nLine 2\nLine 3"
    );
  });

  it("strips HTML tags", () => {
    expect(sanitizePostContent("<b>bold</b> text")).toBe("bold text");
  });

  it("strips script tags and their content is removed (tag stripped, text left)", () => {
    expect(sanitizePostContent("<script>alert('xss')</script>Hello")).toBe(
      "alert('xss')Hello"
    );
  });

  it("strips nested HTML tags", () => {
    expect(sanitizePostContent("<p><strong>Hello</strong></p>")).toBe("Hello");
  });

  it("removes ASCII control characters", () => {
    expect(sanitizePostContent("Hello\x00World")).toBe("HelloWorld");
    expect(sanitizePostContent("Hello\x01\x02\x03World")).toBe("HelloWorld");
    expect(sanitizePostContent("Tab\tseparated")).toBe("Tab\tseparated"); // tab preserved
    expect(sanitizePostContent("New\nline")).toBe("New\nline"); // newline preserved
  });

  it("removes zero-width characters", () => {
    expect(sanitizePostContent("Hello\u200BWorld")).toBe("HelloWorld");
    expect(sanitizePostContent("Hello\uFEFFWorld")).toBe("HelloWorld");
    expect(sanitizePostContent("Hello\u200CWorld")).toBe("HelloWorld");
    expect(sanitizePostContent("Hello\u200DWorld")).toBe("HelloWorld");
  });

  it("trims leading and trailing whitespace", () => {
    expect(sanitizePostContent("  Hello World  ")).toBe("Hello World");
  });

  it("handles empty string", () => {
    expect(sanitizePostContent("")).toBe("");
  });

  it("handles string with only whitespace", () => {
    expect(sanitizePostContent("   ")).toBe("");
  });

  it("handles string with only HTML tags", () => {
    expect(sanitizePostContent("<p></p>")).toBe("");
  });

  it("preserves emoji and unicode text", () => {
    expect(sanitizePostContent("Hello 🎉 World 你好")).toBe(
      "Hello 🎉 World 你好"
    );
  });

  it("preserves URLs in content", () => {
    expect(sanitizePostContent("Check out https://example.com today!")).toBe(
      "Check out https://example.com today!"
    );
  });

  it("strips HTML attributes", () => {
    expect(
      sanitizePostContent('<a href="javascript:void(0)" onclick="evil()">click</a>')
    ).toBe("click");
  });
});
