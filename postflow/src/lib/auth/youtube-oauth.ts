import { z } from "zod";

const GOOGLE_OAUTH_DIALOG = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const YOUTUBE_CHANNELS_URL =
  "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true";

export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
].join(" ");

// ── Zod schemas ──────────────────────────────────────────────────────────────

const tokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  token_type: z.string(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
});

const channelListSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        snippet: z.object({
          title: z.string(),
          customUrl: z.string().optional(),
          thumbnails: z
            .object({
              default: z.object({ url: z.string() }).optional(),
            })
            .optional(),
        }),
      })
    )
    .optional(),
});

export type YouTubeChannel = {
  id: string;
  title: string;
  customUrl?: string;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} environment variable is not set`);
  return value;
}

interface GoogleErrorResponse {
  error?: string;
  error_description?: string;
  message?: string;
}

async function googleApiFetch<T>(
  url: string,
  schema: z.ZodType<T>,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, options);
  const data: unknown = await response.json();

  if (!response.ok) {
    const err = data as GoogleErrorResponse;
    throw new Error(
      `Google API error (${response.status}): ${err.error_description ?? err.message ?? err.error ?? response.statusText}`
    );
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Google API response validation failed: ${parsed.error.message}`
    );
  }

  return parsed.data;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Builds the Google OAuth 2.0 authorization URL for YouTube access.
 */
export function buildYouTubeOAuthUrl(state: string): string {
  const clientId = getRequiredEnv("YOUTUBE_CLIENT_ID");
  const callbackUrl = getRequiredEnv("YOUTUBE_OAUTH_CALLBACK_URL");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: callbackUrl,
    scope: YOUTUBE_SCOPES,
    state,
    access_type: "offline",
    prompt: "consent",
  });

  return `${GOOGLE_OAUTH_DIALOG}?${params.toString()}`;
}

/**
 * Exchanges an authorization code for access + refresh tokens.
 */
export async function exchangeYouTubeCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string | undefined;
  expiresIn: number;
}> {
  const clientId = getRequiredEnv("YOUTUBE_CLIENT_ID");
  const clientSecret = getRequiredEnv("YOUTUBE_CLIENT_SECRET");
  const callbackUrl = getRequiredEnv("YOUTUBE_OAUTH_CALLBACK_URL");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: callbackUrl,
  });

  const data = await googleApiFetch(GOOGLE_TOKEN_URL, tokenResponseSchema, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

/**
 * Fetches the authenticated user's YouTube channel info.
 */
export async function getYouTubeChannel(
  accessToken: string
): Promise<YouTubeChannel> {
  const data = await googleApiFetch(
    YOUTUBE_CHANNELS_URL,
    channelListSchema,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const channel = data.items?.[0];
  if (!channel) {
    throw new Error("No YouTube channel found for this Google account");
  }

  return {
    id: channel.id,
    title: channel.snippet.title,
    customUrl: channel.snippet.customUrl,
  };
}
