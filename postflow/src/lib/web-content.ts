const MAX_BODY_CHARS = 20000;

export interface WebContent {
  title: string;
  content: string;
}

export async function extractWebContent(url: string): Promise<WebContent | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "PostFlow/1.0 (content-importer)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return null;

    const html = await response.text();

    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "";

    const withoutScripts = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
    const withoutStyles = withoutScripts.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
    const withoutTags = withoutStyles.replace(/<[^>]+>/g, " ");
    const decoded = withoutTags
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ");
    const body = decoded.replace(/\s+/g, " ").trim().slice(0, MAX_BODY_CHARS);

    if (!body) return null;

    return { title, content: body };
  } catch {
    return null;
  }
}
