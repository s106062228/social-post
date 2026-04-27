// RSS 2.0 and Atom feed parser — no external dependencies.
// Uses Node's built-in fetch to retrieve feeds and simple string
// extraction to parse the XML into normalised items.

export interface RssParsedItem {
  guid: string;
  title: string | null;
  content: string | null;
  link: string | null;
  imageUrl: string | null;
  publishedAt: Date | null;
}

export interface RssParsedFeed {
  title: string | null;
  items: RssParsedItem[];
}

// ── Text extraction helpers ────────────────────────────────────────────────────

function extractTagContent(xml: string, tag: string): string | null {
  // Handles <tag>value</tag> and <tag><![CDATA[value]]></tag>
  const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = pattern.exec(xml);
  if (!match) return null;
  let value = match[1].trim();
  // Unwrap CDATA
  const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(value);
  if (cdata) value = cdata[1].trim();
  return value || null;
}

function extractAttribute(xml: string, tag: string, attr: string): string | null {
  const pattern = new RegExp(`<${tag}[^>]*\\s${attr}="([^"]*)"`, "i");
  const match = pattern.exec(xml);
  return match ? match[1].trim() : null;
}

function extractSelfClosingAttr(
  xml: string,
  tag: string,
  attr: string
): string | null {
  // Matches <tag attr="value" /> or <tag attr="value">
  const pattern = new RegExp(`<${tag}\\s[^>]*\\s${attr}="([^"]*)"`, "i");
  const match = pattern.exec(xml);
  return match ? match[1].trim() : null;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, code: string) =>
      String.fromCodePoint(parseInt(code, 10))
    );
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseDate(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

// ── Item splitter ──────────────────────────────────────────────────────────────

function splitItems(xml: string, tag: string): string[] {
  const items: string[] = [];
  const openTag = `<${tag}`;
  const closeTag = `</${tag}>`;
  let pos = 0;
  while (pos < xml.length) {
    const start = xml.indexOf(openTag, pos);
    if (start === -1) break;
    const end = xml.indexOf(closeTag, start);
    if (end === -1) break;
    items.push(xml.slice(start, end + closeTag.length));
    pos = end + closeTag.length;
  }
  return items;
}

// ── RSS 2.0 parser ─────────────────────────────────────────────────────────────

function parseRssItem(itemXml: string, index: number): RssParsedItem {
  const guid =
    extractTagContent(itemXml, "guid") ??
    extractTagContent(itemXml, "link") ??
    `item-${index}`;

  const title = extractTagContent(itemXml, "title");
  const link =
    extractTagContent(itemXml, "link") ??
    extractAttribute(itemXml, "link", "href");

  // Prefer content:encoded, fall back to description
  const rawContent =
    extractTagContent(itemXml, "content:encoded") ??
    extractTagContent(itemXml, "description");
  const content = rawContent
    ? decodeHtmlEntities(stripHtml(rawContent)).slice(0, 5000)
    : null;

  // Enclosure image
  const imageUrl =
    extractSelfClosingAttr(itemXml, "enclosure", "url") ??
    extractSelfClosingAttr(itemXml, "media:content", "url") ??
    extractTagContent(itemXml, "media:thumbnail");

  const pubDateRaw = extractTagContent(itemXml, "pubDate");
  const publishedAt = parseDate(pubDateRaw);

  return {
    guid: decodeHtmlEntities(guid),
    title: title ? decodeHtmlEntities(title) : null,
    content,
    link: link ? decodeHtmlEntities(link) : null,
    imageUrl: imageUrl ?? null,
    publishedAt,
  };
}

function parseRss(xml: string): RssParsedFeed {
  const title = extractTagContent(xml, "title");
  const itemBlocks = splitItems(xml, "item");
  const items = itemBlocks.map((block, i) => parseRssItem(block, i));
  return { title: title ? decodeHtmlEntities(title) : null, items };
}

// ── Atom parser ────────────────────────────────────────────────────────────────

function parseAtomEntry(entryXml: string, index: number): RssParsedItem {
  const guid =
    extractTagContent(entryXml, "id") ??
    extractAttribute(entryXml, "link", "href") ??
    `entry-${index}`;

  const title = extractTagContent(entryXml, "title");

  // <link href="..." /> self-closing in Atom
  const link =
    extractAttribute(entryXml, 'link rel="alternate"', "href") ??
    extractSelfClosingAttr(entryXml, "link", "href");

  const rawContent =
    extractTagContent(entryXml, "content") ??
    extractTagContent(entryXml, "summary");
  const content = rawContent
    ? decodeHtmlEntities(stripHtml(rawContent)).slice(0, 5000)
    : null;

  const imageUrl =
    extractSelfClosingAttr(entryXml, "media:content", "url") ??
    extractTagContent(entryXml, "media:thumbnail");

  const publishedRaw =
    extractTagContent(entryXml, "published") ??
    extractTagContent(entryXml, "updated");
  const publishedAt = parseDate(publishedRaw);

  return {
    guid: decodeHtmlEntities(guid),
    title: title ? decodeHtmlEntities(title) : null,
    content,
    link: link ? decodeHtmlEntities(link) : null,
    imageUrl: imageUrl ?? null,
    publishedAt,
  };
}

function parseAtom(xml: string): RssParsedFeed {
  const title = extractTagContent(xml, "title");
  const entryBlocks = splitItems(xml, "entry");
  const items = entryBlocks.map((block, i) => parseAtomEntry(block, i));
  return { title: title ? decodeHtmlEntities(title) : null, items };
}

// ── Public API ─────────────────────────────────────────────────────────────────

export class RssFetchError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = "RssFetchError";
  }
}

/**
 * Fetches and parses an RSS 2.0 or Atom feed from the given URL.
 * Throws RssFetchError on network or HTTP errors.
 * Returns up to 50 normalised items sorted newest-first.
 */
export async function fetchAndParseFeed(url: string): Promise<RssParsedFeed> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": "PostFlow/1.0 (RSS reader)" },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new RssFetchError(`Network error fetching ${url}: ${msg}`);
  }

  if (!response.ok) {
    throw new RssFetchError(
      `HTTP ${response.status} fetching ${url}`,
      response.status
    );
  }

  const xml = await response.text();

  // Detect feed type
  const isAtom =
    xml.includes("<feed") && xml.includes("xmlns") && xml.includes("<entry");
  const feed = isAtom ? parseAtom(xml) : parseRss(xml);

  // Deduplicate by guid, sort newest-first, cap at 50
  const seen = new Set<string>();
  const deduped = feed.items.filter((item) => {
    if (seen.has(item.guid)) return false;
    seen.add(item.guid);
    return true;
  });

  deduped.sort((a, b) => {
    const ta = a.publishedAt?.getTime() ?? 0;
    const tb = b.publishedAt?.getTime() ?? 0;
    return tb - ta;
  });

  return { title: feed.title, items: deduped.slice(0, 50) };
}
