/** Extract the first HTTP/HTTPS URL from a string. Returns null if none found. */
export function extractFirstUrl(text: string): string | null {
  const re = /https?:\/\/[^\s"'<>()[\]{}]+/i;
  const m = re.exec(text);
  return m ? m[0] : null;
}
