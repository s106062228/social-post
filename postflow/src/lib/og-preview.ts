import { Redis } from "ioredis";
export { extractFirstUrl } from "@/lib/url-utils";

export interface OgMetadata {
  url: string;
  title: string;
  description: string;
  image: string;
}

const CACHE_TTL_SECONDS = 86_400; // 24 hours
const FETCH_TIMEOUT_MS = 5_000;

let redis: Redis | null = null;

function getRedis(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!redis) {
    redis = new Redis(url, { lazyConnect: true, enableReadyCheck: false });
  }
  return redis;
}

function cacheKey(url: string): string {
  return `og:${url}`;
}

/** Extract a single meta tag content value from raw HTML. */
function extractMeta(html: string, property: string): string {
  // Matches both property="og:x" and name="og:x" forms
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["']`,
    "i"
  );
  const alt = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["']`,
    "i"
  );
  const m = re.exec(html) ?? alt.exec(html);
  return m ? (m[1] ?? "") : "";
}

/** Extract <title> text from raw HTML as a fallback. */
function extractTitle(html: string): string {
  const m = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  return m ? (m[1] ?? "").trim() : "";
}

/**
 * Fetch Open Graph metadata for the given URL.
 * Results are cached in Redis for 24 hours.
 * Returns an object with empty strings if metadata cannot be fetched.
 */
export async function fetchOgMetadata(url: string): Promise<OgMetadata> {
  const empty: OgMetadata = { url, title: "", description: "", image: "" };

  // Check Redis cache first
  const client = getRedis();
  const key = cacheKey(url);
  if (client) {
    try {
      const cached = await client.get(key);
      if (cached) {
        return JSON.parse(cached) as OgMetadata;
      }
    } catch {
      // cache miss is non-fatal
    }
  }

  let html: string;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "PostFlow/1.0 (+https://postflow.app)" },
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!res.ok) return empty;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return empty;
    // Read only the first 64 KB to avoid large payloads
    const buffer = await res.arrayBuffer();
    html = new TextDecoder().decode(buffer.slice(0, 65_536));
  } catch {
    return empty;
  }

  const result: OgMetadata = {
    url,
    title: extractMeta(html, "og:title") || extractTitle(html),
    description: extractMeta(html, "og:description"),
    image: extractMeta(html, "og:image"),
  };

  // Store in Redis cache
  if (client) {
    try {
      await client.setex(key, CACHE_TTL_SECONDS, JSON.stringify(result));
    } catch {
      // cache write failure is non-fatal
    }
  }

  return result;
}

