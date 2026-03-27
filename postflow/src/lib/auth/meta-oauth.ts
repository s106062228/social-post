import { z } from "zod";

const META_API_BASE = "https://graph.facebook.com/v21.0";
const META_OAUTH_DIALOG = "https://www.facebook.com/v21.0/dialog/oauth";
const THREADS_API_BASE = "https://graph.threads.net/v21.0";

export const META_SCOPES = [
  "pages_manage_posts",
  "pages_read_engagement",
  "pages_show_list",
  "instagram_basic",
  "instagram_content_publish",
  "threads_basic",
  "threads_content_publish",
  "threads_manage_insights",
].join(",");

// ── Zod schemas ──────────────────────────────────────────────────────────────

const tokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
});

const longLivedTokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.number(),
});

const metaPageSchema = z.object({
  id: z.string(),
  name: z.string(),
  access_token: z.string(),
  category: z.string().optional(),
});

const pagesResponseSchema = z.object({
  data: z.array(metaPageSchema),
});

const pageWithInstagramSchema = z.object({
  id: z.string(),
  name: z.string(),
  instagram_business_account: z
    .object({ id: z.string() })
    .optional(),
});

const threadsUserSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  username: z.string().optional(),
});

export type MetaPage = z.infer<typeof metaPageSchema>;
export type PageWithInstagram = z.infer<typeof pageWithInstagramSchema>;
export type ThreadsUser = z.infer<typeof threadsUserSchema>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} environment variable is not set`);
  return value;
}

interface MetaErrorResponse {
  error?: {
    message?: string;
    code?: number;
  };
}

async function metaApiFetch<T>(
  url: string,
  schema: z.ZodType<T>,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, options);
  const data: unknown = await response.json();

  if (!response.ok) {
    const errorData = data as MetaErrorResponse;
    throw new Error(
      `Meta API error (${response.status}): ${errorData.error?.message ?? response.statusText}`
    );
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Meta API response validation failed: ${parsed.error.message}`
    );
  }

  return parsed.data;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Builds the Meta OAuth dialog URL with all required scopes.
 */
export function buildOAuthUrl(state: string): string {
  const appId = getRequiredEnv("META_APP_ID");
  const callbackUrl = getRequiredEnv("META_OAUTH_CALLBACK_URL");

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: callbackUrl,
    scope: META_SCOPES,
    state,
    response_type: "code",
  });

  return `${META_OAUTH_DIALOG}?${params.toString()}`;
}

/**
 * Exchanges an authorization code for a short-lived user access token (1 hr).
 */
export async function exchangeCodeForShortLivedToken(
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; tokenType: string }> {
  const appId = getRequiredEnv("META_APP_ID");
  const appSecret = getRequiredEnv("META_APP_SECRET");

  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  });

  const url = `${META_API_BASE}/oauth/access_token?${params.toString()}`;
  const data = await metaApiFetch(url, tokenResponseSchema);

  return { accessToken: data.access_token, tokenType: data.token_type };
}

/**
 * Exchanges a short-lived token for a long-lived user access token (~60 days).
 */
export async function exchangeForLongLivedToken(
  shortLivedToken: string
): Promise<{ accessToken: string; expiresIn: number }> {
  const appId = getRequiredEnv("META_APP_ID");
  const appSecret = getRequiredEnv("META_APP_SECRET");

  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken,
  });

  const url = `${META_API_BASE}/oauth/access_token?${params.toString()}`;
  const data = await metaApiFetch(url, longLivedTokenResponseSchema);

  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

/**
 * Returns a list of Facebook Pages the user manages, including page tokens.
 * Page tokens derived from a long-lived user token never expire.
 */
export async function getUserPages(
  longLivedToken: string
): Promise<MetaPage[]> {
  const params = new URLSearchParams({
    access_token: longLivedToken,
    fields: "id,name,access_token,category",
  });

  const url = `${META_API_BASE}/me/accounts?${params.toString()}`;
  const data = await metaApiFetch(url, pagesResponseSchema);

  return data.data;
}

/**
 * Fetches a Facebook Page with its linked Instagram Business Account (if any).
 */
export async function getPageInstagramAccount(
  pageId: string,
  pageToken: string
): Promise<PageWithInstagram> {
  const params = new URLSearchParams({
    access_token: pageToken,
    fields: "id,name,instagram_business_account",
  });

  const url = `${META_API_BASE}/${pageId}?${params.toString()}`;
  return metaApiFetch(url, pageWithInstagramSchema);
}

/**
 * Fetches Threads user info using the long-lived user access token.
 */
export async function getThreadsUser(
  userToken: string
): Promise<ThreadsUser> {
  const params = new URLSearchParams({
    access_token: userToken,
    fields: "id,name,username",
  });

  const url = `${THREADS_API_BASE}/me?${params.toString()}`;
  return metaApiFetch(url, threadsUserSchema);
}
