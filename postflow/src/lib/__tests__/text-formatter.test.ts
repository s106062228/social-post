import {
  formatText,
  convertEmojiShortcodes,
  processText,
  EMOJI_SHORTCODES,
} from "../text-formatter";

// ── formatText ────────────────────────────────────────────────────────────────

describe("formatText", () => {
  it("returns empty string unchanged for any style", () => {
    expect(formatText("", "bold")).toBe("");
    expect(formatText("", "italic")).toBe("");
    expect(formatText("", "strikethrough")).toBe("");
  });

  it("returns text unchanged when style is none", () => {
    expect(formatText("Hello World 123", "none")).toBe("Hello World 123");
  });

  it("bold: transforms uppercase ASCII letters", () => {
    const result = formatText("ABC", "bold");
    // 𝐀 = U+1D400, 𝐁 = U+1D401, 𝐂 = U+1D402
    expect(result.codePointAt(0)).toBe(0x1d400);
    expect(result.codePointAt(2)).toBe(0x1d401);
  });

  it("bold: transforms lowercase ASCII letters", () => {
    const result = formatText("abc", "bold");
    // 𝐚 = U+1D41A
    expect(result.codePointAt(0)).toBe(0x1d41a);
  });

  it("bold: transforms digits", () => {
    const result = formatText("0", "bold");
    // 𝟎 = U+1D7CE
    expect(result.codePointAt(0)).toBe(0x1d7ce);
  });

  it("italic: transforms lowercase ASCII letters", () => {
    const result = formatText("a", "italic");
    // 𝑎 = U+1D44E
    expect(result.codePointAt(0)).toBe(0x1d44e);
  });

  it("italic: handles the h exception (ℎ PLANCK CONSTANT)", () => {
    const result = formatText("h", "italic");
    expect(result).toBe("ℎ");
  });

  it("bold-italic: transforms letters", () => {
    const result = formatText("A", "bold-italic");
    // 𝑨 = U+1D468
    expect(result.codePointAt(0)).toBe(0x1d468);
  });

  it("strikethrough: inserts combining character after each char", () => {
    const result = formatText("hi", "strikethrough");
    // Each char followed by U+0336
    expect([...result]).toEqual(["h", "̶", "i", "̶"]);
  });

  it("monospace: transforms letters", () => {
    const result = formatText("a", "monospace");
    // 𝚊 = U+1D68A
    expect(result.codePointAt(0)).toBe(0x1d68a);
  });

  it("monospace: transforms digits", () => {
    const result = formatText("5", "monospace");
    // 𝟻 = U+1D7FB
    expect(result.codePointAt(0)).toBe(0x1d7f6 + 5);
  });

  it("non-ASCII characters pass through unchanged in bold", () => {
    const result = formatText("hello 🔥", "bold");
    expect(result).toContain("🔥");
  });

  it("punctuation passes through unchanged", () => {
    const result = formatText("Hello, World!", "bold");
    expect(result).toContain(",");
    expect(result).toContain("!");
  });

  it("italic: does not transform digits", () => {
    const result = formatText("abc 123", "italic");
    expect(result).toContain("123");
  });
});

// ── convertEmojiShortcodes ───────────────────────────────────────────────────

describe("convertEmojiShortcodes", () => {
  it("converts :fire: to emoji", () => {
    expect(convertEmojiShortcodes(":fire:")).toBe("🔥");
  });

  it("converts :rocket: to emoji", () => {
    expect(convertEmojiShortcodes(":rocket:")).toBe("🚀");
  });

  it("converts multiple shortcodes in one string", () => {
    expect(convertEmojiShortcodes(":fire: and :heart:")).toBe("🔥 and ❤️");
  });

  it("leaves unknown shortcodes unchanged", () => {
    expect(convertEmojiShortcodes(":not_a_real_code:")).toBe(":not_a_real_code:");
  });

  it("leaves plain text unchanged", () => {
    expect(convertEmojiShortcodes("hello world")).toBe("hello world");
  });

  it("all exported EMOJI_SHORTCODES are convertible", () => {
    for (const [code, emoji] of Object.entries(EMOJI_SHORTCODES)) {
      expect(convertEmojiShortcodes(code)).toBe(emoji);
    }
  });
});

// ── processText ───────────────────────────────────────────────────────────────

describe("processText", () => {
  it("returns formatted string and code-point char count", () => {
    const { formatted, charCount } = processText("hello", "bold");
    expect(typeof formatted).toBe("string");
    expect(charCount).toBe(5);
  });

  it("converts emoji shortcodes when flag is true", () => {
    const { formatted } = processText(":fire:", "none", true);
    expect(formatted).toBe("🔥");
  });

  it("does not convert emoji shortcodes when flag is false", () => {
    const { formatted } = processText(":fire:", "none", false);
    expect(formatted).toBe(":fire:");
  });

  it("applies both style and emoji conversion together", () => {
    const { formatted } = processText("test :fire:", "bold", true);
    expect(formatted).toContain("🔥");
    // The word "test" should be bold
    expect(formatted).not.toBe("test :fire:");
  });

  it("charCount uses code-point length (not UTF-16 units)", () => {
    // "🔥" is 1 code-point but 2 UTF-16 units
    const { charCount } = processText("🔥", "none");
    expect(charCount).toBe(1);
  });

  it("style none skips formatting", () => {
    const { formatted } = processText("abc", "none");
    expect(formatted).toBe("abc");
  });
});
