import { z } from "zod";

const WORDPRESS_OAUTH_DIALOG = "https://public-api.wordpress.com/oauth2/authorize";
const WORDPRESS_TOKEN_URL = "https://public-api.wordpress.com/oauth2/token";
const WORDPRESS_API_BASE = "https://public-api.wordpress.com/rest/v1.1";

export const WORDPRESS_SCOPES = "posts global";

// ── Zod schemas ───────────────────────────────────────────────────────────────

const tokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  blog_id: z.union([z.string(), z.number()]).optional(),
  blog_url: z.string().optional(),
  scope: z.string().optional(),
});

const siteSchema = z.object({
  ID: z.union([z.string(), z.number()]),
  name: z.string(),
  URL: z.string(),
});

const sitesResponseSchema = z.object({
  sites: z.array(siteSchema),
});

// ── Types ─────────────────────────────────────────────────────────────────────

export type WordPressSite = {
  id: string;
  name: string;
  url: string;
};

export type WordPressToken = {
  accessToken: string;
  siteId: string;
  siteUrl: string;
  blogName: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} environment variable is not set`);
  return value;
}

interface WordPressErrorResponse {
  error?: string;
  message?: string;
  error_description?: string;
}

async function wordpressApiFetch<T>(
  url: string,
  schema: z.ZodType<T>,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, options);
  const data: unknown = await response.json();

  if (!response.ok) {
    const err = data as WordPressErrorResponse;
    const detail =
      err.message ?? err.error_description ?? err.error ?? response.statusText;
    throw new Error(`WordPress API error (${response.status}): ${detail}`);
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `WordPress API response validation failed: ${parsed.error.message}`
    );
  }

  return parsed.data;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function buildWordPressOAuthUrl(state: string): string {
  const clientId = getRequiredEnv("WORDPRESS_CLIENT_ID");
  const callbackUrl = getRequiredEnv("WORDPRESS_OAUTH_CALLBACK_URL");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: "code",
    scope: WORDPRESS_SCOPES,
    state,
  });

  return `${WORDPRESS_OAUTH_DIALOG}?${params.toString()}`;
}

export async function exchangeWordPressCode(code: string): Promise<{
  accessToken: string;
  blogId: string | undefined;
  blogUrl: string | undefined;
}> {
  const clientId = getRequiredEnv("WORDPRESS_CLIENT_ID");
  const clientSecret = getRequiredEnv("WORDPRESS_CLIENT_SECRET");
  const callbackUrl = getRequiredEnv("WORDPRESS_OAUTH_CALLBACK_URL");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const data = await wordpressApiFetch(WORDPRESS_TOKEN_URL, tokenResponseSchema, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  return {
    accessToken: data.access_token,
    blogId: data.blog_id !== undefined ? String(data.blog_id) : undefined,
    blogUrl: data.blog_url,
  };
}

export async function getWordPressSites(
  accessToken: string
): Promise<WordPressSite[]> {
  const data = await wordpressApiFetch(
    `${WORDPRESS_API_BASE}/me/sites`,
    sitesResponseSchema,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  return data.sites.map((s) => ({
    id: String(s.ID),
    name: s.name,
    url: s.URL,
  }));
}

export function serializeWordPressToken(token: WordPressToken): string {
  return JSON.stringify(token);
}

export function parseWordPressToken(raw: string): WordPressToken {
  const parsed: unknown = JSON.parse(raw);
  const schema = z.object({
    accessToken: z.string(),
    siteId: z.string(),
    siteUrl: z.string(),
    blogName: z.string(),
  });
  return schema.parse(parsed);
}
