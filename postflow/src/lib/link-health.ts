export { extractUrls } from "@/lib/utm";

export interface LinkHealthCheckResult {
  url: string;
  statusCode: number | null;
  isHealthy: boolean;
  errorMessage: string | null;
}

const FETCH_TIMEOUT_MS = 5_000;
const MAX_LINKS_PER_CHECK = 10;

function classifyStatus(statusCode: number): boolean {
  return statusCode >= 200 && statusCode < 400;
}

async function fetchWithTimeout(url: string, method: "HEAD" | "GET"): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method,
      signal: controller.signal,
      headers: { "User-Agent": "PostFlow/1.0 (+https://postflow.app)" },
      redirect: "follow",
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Checks whether a URL is reachable and returns a healthy status code.
 * Tries a HEAD request first (cheaper); falls back to GET when the server
 * rejects HEAD (405/501) or the HEAD request itself fails.
 */
export async function checkUrlHealth(url: string): Promise<LinkHealthCheckResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { url, statusCode: null, isHealthy: false, errorMessage: "Invalid URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { url, statusCode: null, isHealthy: false, errorMessage: "Unsupported URL scheme" };
  }

  try {
    let res: Response;
    try {
      res = await fetchWithTimeout(url, "HEAD");
      if (res.status === 405 || res.status === 501) {
        res = await fetchWithTimeout(url, "GET");
      }
    } catch {
      res = await fetchWithTimeout(url, "GET");
    }

    return {
      url,
      statusCode: res.status,
      isHealthy: classifyStatus(res.status),
      errorMessage: classifyStatus(res.status) ? null : `HTTP ${res.status}`,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? "Request timed out"
          : err.message
        : "Request failed";
    return { url, statusCode: null, isHealthy: false, errorMessage: message };
  }
}

/**
 * Runs health checks for up to MAX_LINKS_PER_CHECK URLs in parallel.
 */
export async function checkUrlsHealth(urls: string[]): Promise<LinkHealthCheckResult[]> {
  const targets = urls.slice(0, MAX_LINKS_PER_CHECK);
  return Promise.all(targets.map((url) => checkUrlHealth(url)));
}

export { MAX_LINKS_PER_CHECK };
