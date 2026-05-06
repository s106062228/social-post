import { z } from "zod";
import { createHash, randomBytes } from "crypto";

const TWITTER_OAUTH_DIALOG = "https://twitter.com/i/oauth2/authorize";
const TWITTER_TOKEN_URL = "https://api.twitter.com/2/oauth2/token";
const TWITTER_USER_URL = "https://api.twitter.com/2/users/me";

export const TWITTER_SCOPES = [
  "tweet.write",
  "tweet.read",
  "users.read",
  "offline.access",
].join(" ");

// ── Zod schemas ──────────────────────────────────────────────────────────────

const tokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.number().optional(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
});

const userResponseSchema = z.object({
  data: z.object({
    id: z.string(),
    name: z.string(),
    username: z.string(),
  }),
});

export type TwitterUserInfo = {
  id: string;
  name: string;
  username: string;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} environment variable is not set`);
  return value;
}

interface TwitterErrorResponse {
  error?: string;
  error_description?: string;
  detail?: string;
}

async function twitterApiFetch<T>(
  url: string,
  schema: z.ZodType<T>,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, options);
  const data: unknown = await response.json();

  if (!response.ok) {
    const err = data as TwitterErrorResponse;
    throw new Error(
      `Twitter API error (${response.status}): ${err.error_description ?? err.detail ?? err.error ?? response.statusText}`
    );
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Twitter API response validation failed: ${parsed.error.message}`
    );
  }

  return parsed.data;
}

// ── PKCE helpers ─────────────────────────────────────────────────────────────

/**
 * Generates a PKCE code verifier (cryptographically random, URL-safe).
 */
export function generateCodeVerifier(): string {
  return randomBytes(32)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Derives the PKCE code challenge from the verifier (S256 method).
 */
export function generateCodeChallenge(verifier: string): string {
  return createHash("sha256")
    .update(verifier)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Builds the Twitter OAuth 2.0 authorization URL with PKCE.
 */
export function buildTwitterOAuthUrl(
  state: string,
  codeChallenge: string
): string {
  const clientId = getRequiredEnv("TWITTER_CLIENT_ID");
  const callbackUrl = getRequiredEnv("TWITTER_OAUTH_CALLBACK_URL");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: callbackUrl,
    scope: TWITTER_SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return `${TWITTER_OAUTH_DIALOG}?${params.toString()}`;
}

/**
 * Exchanges an authorization code for access + refresh tokens using PKCE.
 */
export async function exchangeTwitterCode(
  code: string,
  codeVerifier: string
): Promise<{
  accessToken: string;
  refreshToken: string | undefined;
  expiresIn: number | undefined;
}> {
  const clientId = getRequiredEnv("TWITTER_CLIENT_ID");
  const clientSecret = getRequiredEnv("TWITTER_CLIENT_SECRET");
  const callbackUrl = getRequiredEnv("TWITTER_OAUTH_CALLBACK_URL");

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64"
  );

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl,
    code_verifier: codeVerifier,
  });

  const data = await twitterApiFetch(TWITTER_TOKEN_URL, tokenResponseSchema, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: body.toString(),
  });

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

/**
 * Fetches the authenticated user's Twitter profile info.
 */
export async function getTwitterUser(
  accessToken: string
): Promise<TwitterUserInfo> {
  const data = await twitterApiFetch(TWITTER_USER_URL, userResponseSchema, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  return {
    id: data.data.id,
    name: data.data.name,
    username: data.data.username,
  };
}
