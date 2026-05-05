import { z } from "zod";

const TIKTOK_OAUTH_DIALOG = "https://www.tiktok.com/v2/auth/authorize/";
const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const TIKTOK_USER_INFO_URL =
  "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url";

export const TIKTOK_SCOPES = ["user.info.basic", "video.publish"].join(",");

// ── Zod schemas ──────────────────────────────────────────────────────────────

const tokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  token_type: z.string(),
  refresh_token: z.string().optional(),
  refresh_expires_in: z.number().optional(),
  open_id: z.string(),
  scope: z.string().optional(),
});

const userInfoSchema = z.object({
  data: z.object({
    user: z.object({
      open_id: z.string(),
      display_name: z.string(),
      avatar_url: z.string().optional(),
    }),
  }),
});

export type TikTokUserInfo = {
  openId: string;
  displayName: string;
  avatarUrl?: string;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} environment variable is not set`);
  return value;
}

interface TikTokErrorResponse {
  error?: string;
  error_description?: string;
  message?: string;
}

async function tikTokApiFetch<T>(
  url: string,
  schema: z.ZodType<T>,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, options);
  const data: unknown = await response.json();

  if (!response.ok) {
    const err = data as TikTokErrorResponse;
    throw new Error(
      `TikTok API error (${response.status}): ${err.error_description ?? err.message ?? err.error ?? response.statusText}`
    );
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `TikTok API response validation failed: ${parsed.error.message}`
    );
  }

  return parsed.data;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Builds the TikTok OAuth 2.0 authorization URL.
 */
export function buildTikTokOAuthUrl(state: string): string {
  const clientKey = getRequiredEnv("TIKTOK_CLIENT_KEY");
  const callbackUrl = getRequiredEnv("TIKTOK_OAUTH_CALLBACK_URL");

  const params = new URLSearchParams({
    response_type: "code",
    client_key: clientKey,
    redirect_uri: callbackUrl,
    scope: TIKTOK_SCOPES,
    state,
  });

  return `${TIKTOK_OAUTH_DIALOG}?${params.toString()}`;
}

/**
 * Exchanges an authorization code for access + refresh tokens.
 */
export async function exchangeTikTokCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string | undefined;
  expiresIn: number;
  openId: string;
}> {
  const clientKey = getRequiredEnv("TIKTOK_CLIENT_KEY");
  const clientSecret = getRequiredEnv("TIKTOK_CLIENT_SECRET");
  const callbackUrl = getRequiredEnv("TIKTOK_OAUTH_CALLBACK_URL");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_key: clientKey,
    client_secret: clientSecret,
    redirect_uri: callbackUrl,
  });

  const data = await tikTokApiFetch(TIKTOK_TOKEN_URL, tokenResponseSchema, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    openId: data.open_id,
  };
}

/**
 * Fetches the authenticated user's TikTok profile info.
 */
export async function getTikTokUserInfo(
  accessToken: string
): Promise<TikTokUserInfo> {
  const data = await tikTokApiFetch(TIKTOK_USER_INFO_URL, userInfoSchema, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const user = data.data.user;
  return {
    openId: user.open_id,
    displayName: user.display_name,
    avatarUrl: user.avatar_url,
  };
}
