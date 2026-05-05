import { z } from "zod";

const PINTEREST_OAUTH_DIALOG = "https://www.pinterest.com/oauth/";
const PINTEREST_TOKEN_URL = "https://api.pinterest.com/v5/oauth/token";
const PINTEREST_USER_URL = "https://api.pinterest.com/v5/user_account";
const PINTEREST_BOARDS_URL = "https://api.pinterest.com/v5/boards";

export const PINTEREST_SCOPES =
  "boards:read pins:read pins:write user_accounts:read";

// ── Zod schemas ──────────────────────────────────────────────────────────────

const tokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number().optional(),
  token_type: z.string(),
});

const userAccountSchema = z.object({
  username: z.string(),
  account_type: z.string().optional(),
});

const boardSchema = z.object({
  id: z.string(),
  name: z.string(),
  owner: z.object({ username: z.string() }).optional(),
});

const boardsResponseSchema = z.object({
  items: z.array(boardSchema),
});

export type PinterestBoard = z.infer<typeof boardSchema>;
export type PinterestUserAccount = z.infer<typeof userAccountSchema>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} environment variable is not set`);
  return value;
}

interface PinterestErrorResponse {
  code?: number;
  message?: string;
  error?: string;
  error_description?: string;
}

async function pinterestApiFetch<T>(
  url: string,
  schema: z.ZodType<T>,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, options);
  const data: unknown = await response.json();

  if (!response.ok) {
    const err = data as PinterestErrorResponse;
    throw new Error(
      `Pinterest API error (${response.status}): ${err.message ?? err.error_description ?? err.error ?? response.statusText}`
    );
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Pinterest API response validation failed: ${parsed.error.message}`
    );
  }

  return parsed.data;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Builds the Pinterest OAuth 2.0 authorization URL.
 */
export function buildPinterestOAuthUrl(state: string): string {
  const clientId = getRequiredEnv("PINTEREST_CLIENT_ID");
  const callbackUrl = getRequiredEnv("PINTEREST_OAUTH_CALLBACK_URL");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: "code",
    scope: PINTEREST_SCOPES,
    state,
  });

  return `${PINTEREST_OAUTH_DIALOG}?${params.toString()}`;
}

/**
 * Exchanges an authorization code for an access token.
 * Pinterest uses Basic Auth (client_id:client_secret) for token exchange.
 */
export async function exchangePinterestCode(
  code: string
): Promise<{ accessToken: string; expiresIn?: number }> {
  const clientId = getRequiredEnv("PINTEREST_CLIENT_ID");
  const clientSecret = getRequiredEnv("PINTEREST_CLIENT_SECRET");
  const callbackUrl = getRequiredEnv("PINTEREST_OAUTH_CALLBACK_URL");

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64"
  );

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl,
  });

  const data = await pinterestApiFetch(PINTEREST_TOKEN_URL, tokenResponseSchema, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: body.toString(),
  });

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  };
}

/**
 * Fetches the authenticated Pinterest user's account info.
 */
export async function getPinterestUserAccount(
  accessToken: string
): Promise<PinterestUserAccount> {
  return pinterestApiFetch(PINTEREST_USER_URL, userAccountSchema, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

/**
 * Fetches the authenticated Pinterest user's boards.
 * Returns the full list (up to first page, 25 boards by default).
 */
export async function getPinterestBoards(
  accessToken: string
): Promise<PinterestBoard[]> {
  const data = await pinterestApiFetch(
    `${PINTEREST_BOARDS_URL}?page_size=25`,
    boardsResponseSchema,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return data.items;
}
