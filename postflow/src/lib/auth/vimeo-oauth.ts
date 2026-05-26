import { z } from "zod";

const VIMEO_OAUTH_DIALOG = "https://api.vimeo.com/oauth/authorize";
const VIMEO_TOKEN_URL = "https://api.vimeo.com/oauth/access_token";
const VIMEO_ME_URL = "https://api.vimeo.com/me";

export const VIMEO_SCOPES = "public private upload edit";

// ── Zod schemas ───────────────────────────────────────────────────────────────

const tokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  scope: z.string().optional(),
  user: z
    .object({
      uri: z.string().optional(),
      name: z.string().optional(),
      link: z.string().optional(),
    })
    .optional(),
});

const userSchema = z.object({
  uri: z.string(),
  name: z.string(),
  link: z.string().optional(),
});

export type VimeoUser = {
  userId: string;
  name: string;
  link?: string;
};

export type VimeoToken = {
  accessToken: string;
  userId: string;
  name: string;
  link?: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} environment variable is not set`);
  return value;
}

interface VimeoErrorResponse {
  error?: string;
  developer_message?: string;
  error_code?: number;
  link?: string;
}

async function vimeoApiFetch<T>(
  url: string,
  schema: z.ZodType<T>,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, options);
  const data: unknown = await response.json();

  if (!response.ok) {
    const err = data as VimeoErrorResponse;
    throw new Error(
      `Vimeo API error (${response.status}): ${err.developer_message ?? err.error ?? response.statusText}`
    );
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Vimeo API response validation failed: ${parsed.error.message}`
    );
  }

  return parsed.data;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Builds the Vimeo OAuth 2.0 authorization URL.
 */
export function buildVimeoOAuthUrl(state: string): string {
  const clientId = getRequiredEnv("VIMEO_CLIENT_ID");
  const callbackUrl = getRequiredEnv("VIMEO_OAUTH_CALLBACK_URL");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: callbackUrl,
    scope: VIMEO_SCOPES,
    state,
  });

  return `${VIMEO_OAUTH_DIALOG}?${params.toString()}`;
}

/**
 * Exchanges an authorization code for an access token.
 */
export async function exchangeVimeoCode(code: string): Promise<{
  accessToken: string;
  userId: string;
  name: string;
  link?: string;
}> {
  const clientId = getRequiredEnv("VIMEO_CLIENT_ID");
  const clientSecret = getRequiredEnv("VIMEO_CLIENT_SECRET");
  const callbackUrl = getRequiredEnv("VIMEO_OAUTH_CALLBACK_URL");

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64"
  );

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl,
  });

  const data = await vimeoApiFetch(VIMEO_TOKEN_URL, tokenResponseSchema, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/vnd.vimeo.*+json;version=3.4",
    },
    body: body.toString(),
  });

  // Extract userId from the URI like /users/12345678
  const uriParts = data.user?.uri?.split("/") ?? [];
  const userId = uriParts[uriParts.length - 1] ?? "unknown";

  return {
    accessToken: data.access_token,
    userId,
    name: data.user?.name ?? "Vimeo User",
    link: data.user?.link,
  };
}

/**
 * Fetches Vimeo user info using an access token.
 */
export async function getVimeoUser(accessToken: string): Promise<VimeoUser> {
  const data = await vimeoApiFetch(VIMEO_ME_URL, userSchema, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.vimeo.*+json;version=3.4",
    },
  });

  // Extract userId from the URI like /users/12345678
  const uriParts = data.uri.split("/");
  const userId = uriParts[uriParts.length - 1] ?? "unknown";

  return {
    userId,
    name: data.name,
    link: data.link,
  };
}

// ── Token serialization ───────────────────────────────────────────────────────

/**
 * Serialize a Vimeo token object to a string for encrypted storage.
 */
export function serializeVimeoToken(token: VimeoToken): string {
  return JSON.stringify(token);
}

/**
 * Parse a serialized Vimeo token string back into an object.
 */
export function parseVimeoToken(raw: string): VimeoToken {
  return JSON.parse(raw) as VimeoToken;
}
