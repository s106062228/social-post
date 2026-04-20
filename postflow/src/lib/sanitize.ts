// Strip HTML tags from a string using a simple regex (no DOM dependency).
function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, "");
}

// Remove ASCII control characters (except \t \n \r) and Unicode zero-width chars.
function stripDangerousChars(input: string): string {
  return (
    input
      // ASCII control chars except tab (0x09), newline (0x0A), carriage-return (0x0D)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
      // Unicode zero-width / invisible characters
      .replace(/[\u200B-\u200D\u2028\u2029\uFEFF\u00AD]/g, "")
  );
}

/**
 * Sanitize social-media post content.
 * Strips HTML tags, control characters, and zero-width characters, then trims.
 * Does NOT truncate — callers are responsible for length validation (Zod schema).
 */
export function sanitizePostContent(content: string): string {
  return stripDangerousChars(stripHtml(content)).trim();
}
