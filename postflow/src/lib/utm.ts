export interface UtmParams {
  source: string;
  medium: string;
  campaign?: string | null;
  content?: string | null;
  term?: string | null;
}

const URL_REGEX = /https?:\/\/[^\s"'<>)\]]+/g;

export function appendUtmParams(url: string, params: UtmParams): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  parsed.searchParams.set("utm_source", params.source);
  parsed.searchParams.set("utm_medium", params.medium);
  if (params.campaign) parsed.searchParams.set("utm_campaign", params.campaign);
  if (params.content) parsed.searchParams.set("utm_content", params.content);
  if (params.term) parsed.searchParams.set("utm_term", params.term);

  return parsed.toString();
}

export function extractUrls(content: string): string[] {
  const matches = content.match(URL_REGEX);
  if (!matches) return [];
  // deduplicate while preserving order
  return [...new Set(matches)];
}

export function tagContentUrls(content: string, params: UtmParams): string {
  return content.replace(URL_REGEX, (url) => appendUtmParams(url, params));
}
