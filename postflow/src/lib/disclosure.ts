/**
 * FTC-compliant sponsored post disclosure utilities.
 * Handles adding disclosure text to post content and generating default disclosures.
 */

// Platforms that prefer short hashtag-style disclosures
const HASHTAG_DISCLOSURE_PLATFORMS = new Set([
  "TWITTER",
  "INSTAGRAM",
  "THREADS",
  "TIKTOK",
  "BLUESKY",
  "MASTODON",
  "PIXELFED",
  "NOSTR",
  "TUMBLR",
  "REDDIT",
]);

/**
 * Returns the default disclosure text appropriate for the given platform.
 * Short-form platforms get `#ad` style; long-form get explicit sponsorship notice.
 */
export function getDefaultDisclosure(platform: string): string {
  if (HASHTAG_DISCLOSURE_PLATFORMS.has(platform.toUpperCase())) {
    return "#ad #sponsored";
  }
  return "This is a paid partnership / sponsored content.";
}

/**
 * Builds a full disclosure string from a sponsor name and platform context.
 */
export function buildDisclosureText(sponsorName: string, platform: string): string {
  if (HASHTAG_DISCLOSURE_PLATFORMS.has(platform.toUpperCase())) {
    return `#ad (sponsored by ${sponsorName})`;
  }
  return `Sponsored by ${sponsorName}. This is a paid partnership.`;
}

/**
 * Inserts a disclosure into post content.
 *
 * @param content - The original post content.
 * @param disclosureText - The disclosure string to insert.
 * @param position - Whether to prepend or append the disclosure.
 * @returns The content with disclosure inserted.
 */
export function addDisclosure(
  content: string,
  disclosureText: string,
  position: "prepend" | "append" = "append"
): string {
  const trimmedContent = content.trim();
  const trimmedDisclosure = disclosureText.trim();

  if (!trimmedDisclosure) return trimmedContent;

  if (position === "prepend") {
    return `${trimmedDisclosure}\n\n${trimmedContent}`;
  }
  return `${trimmedContent}\n\n${trimmedDisclosure}`;
}

/**
 * Resolves the final disclosure text to embed before publishing.
 * Uses disclosureText if set; otherwise derives from sponsorName + platform.
 */
export function resolveDisclosure(
  sponsorName: string | null,
  disclosureText: string | null,
  platform: string
): string | null {
  if (disclosureText) return disclosureText.trim();
  if (sponsorName) return buildDisclosureText(sponsorName, platform);
  return null;
}
