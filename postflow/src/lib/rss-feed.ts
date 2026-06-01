export interface RssFeedPost {
  id: string;
  content: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
  platforms?: string[];
}

/** Escape XML special characters */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatRfc822Date(date: Date): string {
  // RFC 822 format: Fri, 01 Jun 2026 12:00:00 +0000
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const day = days[date.getUTCDay()];
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mon = months[date.getUTCMonth()];
  const yyyy = date.getUTCFullYear();
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${day}, ${dd} ${mon} ${yyyy} ${hh}:${mm}:${ss} +0000`;
}

function formatIsoDate(date: Date): string {
  return date.toISOString();
}

/** Build a short title from post content (first 60 chars) */
function buildTitle(content: string): string {
  const firstLine = content.split("\n")[0] ?? content;
  return firstLine.length > 60 ? firstLine.slice(0, 57) + "..." : firstLine;
}

/**
 * Generate an RSS 2.0 XML string for the given posts.
 */
export function generateRssFeed(
  posts: RssFeedPost[],
  author: string,
  feedUrl: string
): string {
  const buildDate = formatRfc822Date(new Date());

  const items = posts
    .slice(0, 50)
    .map((post) => {
      const pubDate = formatRfc822Date(post.publishedAt ?? post.updatedAt ?? post.createdAt);
      const title = escapeXml(buildTitle(post.content));
      const description = escapeXml(post.content);
      const guid = escapeXml(`${feedUrl}#post-${post.id}`);
      const platforms = post.platforms && post.platforms.length > 0
        ? `\n    <category>${escapeXml(post.platforms.join(", "))}</category>`
        : "";
      return `  <item>
    <title>${title}</title>
    <description>${description}</description>
    <pubDate>${pubDate}</pubDate>
    <guid isPermaLink="false">${guid}</guid>${platforms}
  </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(author + " — PostFlow Feed")}</title>
    <link>${escapeXml(feedUrl)}</link>
    <description>Published posts from ${escapeXml(author)} via PostFlow</description>
    <language>en-us</language>
    <lastBuildDate>${buildDate}</lastBuildDate>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;
}

/**
 * Generate an Atom 1.0 XML string for the given posts.
 */
export function generateAtomFeed(
  posts: RssFeedPost[],
  author: string,
  feedUrl: string
): string {
  const updated = formatIsoDate(new Date());

  const entries = posts
    .slice(0, 50)
    .map((post) => {
      const published = formatIsoDate(post.publishedAt ?? post.createdAt);
      const postUpdated = formatIsoDate(post.updatedAt ?? post.createdAt);
      const title = escapeXml(buildTitle(post.content));
      const content = escapeXml(post.content);
      const id = escapeXml(`${feedUrl}#post-${post.id}`);
      return `  <entry>
    <id>${id}</id>
    <title>${title}</title>
    <content type="text">${content}</content>
    <published>${published}</published>
    <updated>${postUpdated}</updated>
  </entry>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${escapeXml(feedUrl)}</id>
  <title>${escapeXml(author + " — PostFlow Feed")}</title>
  <subtitle>Published posts from ${escapeXml(author)} via PostFlow</subtitle>
  <link href="${escapeXml(feedUrl)}" rel="self" type="application/atom+xml" />
  <updated>${updated}</updated>
  <author>
    <name>${escapeXml(author)}</name>
  </author>
${entries}
</feed>`;
}
