// Unicode text styling for social media posts.
// Converts ASCII letters to mathematical Unicode equivalents so the styled
// text renders visually on any platform without actual markdown support.

export type TextStyle =
  | "bold"
  | "italic"
  | "bold-italic"
  | "strikethrough"
  | "monospace"
  | "none";

// Start code-points for the Unicode Mathematical Alphanumeric Symbols block.
const OFFSETS = {
  bold: { upper: 0x1d400, lower: 0x1d41a, digit: 0x1d7ce },
  italic: { upper: 0x1d434, lower: 0x1d44e, digit: null },
  "bold-italic": { upper: 0x1d468, lower: 0x1d482, digit: null },
  monospace: { upper: 0x1d670, lower: 0x1d68a, digit: 0x1d7f6 },
} as const satisfies Record<
  string,
  { upper: number; lower: number; digit: number | null }
>;

// Italic 'h' uses a dedicated code-point (ℎ PLANCK CONSTANT).
const ITALIC_LOWER_EXCEPTIONS: Record<number, string> = {
  104: "ℎ", // h
};

function applyMathStyle(
  text: string,
  style: keyof typeof OFFSETS
): string {
  const { upper, lower, digit } = OFFSETS[style];
  return [...text]
    .map((char) => {
      const cp = char.codePointAt(0);
      if (cp === undefined) return char;
      if (cp >= 65 && cp <= 90) return String.fromCodePoint(upper + (cp - 65));
      if (cp >= 97 && cp <= 122) {
        if (style === "italic" && ITALIC_LOWER_EXCEPTIONS[cp]) {
          return ITALIC_LOWER_EXCEPTIONS[cp];
        }
        return String.fromCodePoint(lower + (cp - 97));
      }
      if (digit !== null && cp >= 48 && cp <= 57) {
        return String.fromCodePoint(digit + (cp - 48));
      }
      return char;
    })
    .join("");
}

function applyStrikethrough(text: string): string {
  // U+0336 COMBINING LONG STROKE OVERLAY overlays the preceding character.
  return [...text].map((char) => char + "̶").join("");
}

/**
 * Apply a Unicode text style to the given string.
 * Only ASCII letters (and digits for bold/monospace) are transformed;
 * all other characters pass through unchanged.
 */
export function formatText(text: string, style: TextStyle): string {
  if (!text || style === "none") return text;
  if (style === "strikethrough") return applyStrikethrough(text);
  return applyMathStyle(text, style);
}

// ── Emoji shortcode conversion ─────────────────────────────────────────────

export const EMOJI_SHORTCODES: Record<string, string> = {
  ":fire:": "🔥",
  ":heart:": "❤️",
  ":star:": "⭐",
  ":check:": "✅",
  ":x:": "❌",
  ":thumbsup:": "👍",
  ":thumbsdown:": "👎",
  ":wave:": "👋",
  ":smile:": "😊",
  ":laugh:": "😂",
  ":rocket:": "🚀",
  ":sparkles:": "✨",
  ":money:": "💰",
  ":chart:": "📈",
  ":trophy:": "🏆",
  ":bulb:": "💡",
  ":warning:": "⚠️",
  ":info:": "ℹ️",
  ":pin:": "📌",
  ":tada:": "🎉",
  ":clap:": "👏",
  ":pray:": "🙏",
  ":eyes:": "👀",
  ":muscle:": "💪",
  ":brain:": "🧠",
  ":clock:": "🕐",
  ":calendar:": "📅",
  ":link:": "🔗",
  ":camera:": "📷",
  ":video:": "🎥",
  ":mic:": "🎤",
  ":globe:": "🌍",
  ":lightning:": "⚡",
  ":crown:": "👑",
  ":gem:": "💎",
  ":target:": "🎯",
  ":key:": "🔑",
  ":lock:": "🔒",
  ":mail:": "📧",
  ":book:": "📖",
  ":pencil:": "✏️",
  ":art:": "🎨",
  ":music:": "🎵",
  ":sun:": "☀️",
  ":moon:": "🌙",
  ":earth:": "🌎",
  ":seedling:": "🌱",
  ":dog:": "🐶",
  ":cat:": "🐱",
};

/**
 * Replace :shortcode: patterns with their emoji equivalents.
 * Unknown shortcodes are returned unchanged.
 */
export function convertEmojiShortcodes(text: string): string {
  return text.replace(/:[a-z_]+:/g, (match) => EMOJI_SHORTCODES[match] ?? match);
}

/**
 * Apply a style and optionally convert emoji shortcodes.
 * Emoji conversion is applied first so that shortcodes are expanded
 * before the Unicode style transformation runs (emojis pass through
 * the style transform unchanged).
 * Returns the formatted string and its Unicode code-point length.
 */
export function processText(
  text: string,
  style: TextStyle,
  convertEmojis: boolean = false
): { formatted: string; charCount: number } {
  let result = convertEmojis ? convertEmojiShortcodes(text) : text;
  if (style !== "none") result = formatText(result, style);
  return { formatted: result, charCount: [...result].length };
}
