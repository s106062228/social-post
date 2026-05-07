import { z } from "zod";

const MEDIUM_OAUTH_DIALOG = "https://medium.com/m/oauth/authorize";
const MEDIUM_TOKEN_URL = "https://api.medium.com/v1/tokens";
const MEDIUM_API_BASE = "https://api.medium.com/v1";

export const MEDIUM_SCOPES = "basicProfile publishPost";

// ── Zod schemas ───────────────────────────────────────────────────────────────

const tokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
  expires_at: z.number().optional(),
});

const userResponseSchema = z.object({
  data: z.object({
    id: z.string(),
    name: z.string(),
    username: z.string().optional(),
    url: z.string().optional(),
  }),
});

// ── Types ─────────────────────────────────────────────────────────────────────

export type MediumToken = {
  accessToken: string;
  refreshToken?: string;
  authorId: string;
  authorName: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} environment variable is not set`);
  return value;
}

interface MediumErrorResponse {
  errors?: Array<{ message?: string; code?: number }>;
}

async function mediumApiFetch<T>(
  url: string,
  schema: z.ZodType<T>,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, options);
  const data: unknown = await response.json();

  if (!response.ok) {
    const err = data as MediumErrorResponse;
    const detail = err.errors?.[0]?.message ?? response.statusText;
    throw new Error(`Medium API error (${response.status}): ${detail}`);
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Medium API response validation failed: ${parsed.error.message}`
    );
  }

  return parsed.data;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function buildMediumOAuthUrl(state: string): string {
  const clientId = getRequiredEnv("MEDIUM_CLIENT_ID");
  const callbackUrl = getRequiredEnv("MEDIUM_OAUTH_CALLBACK_URL");

  const params = new URLSearchParams({
    client_id: clientId,
    scope: MEDIUM_SCOPES,
    state,
    response_type: "code",
    redirect_uri: callbackUrl,
  });

  return `${MEDIUM_OAUTH_DIALOG}?${params.toString()}`;
}

export async function exchangeMediumCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string | undefined;
}> {
  const clientId = getRequiredEnv("MEDIUM_CLIENT_ID");
  const clientSecret = getRequiredEnv("MEDIUM_CLIENT_SECRET");
  const callbackUrl = getRequiredEnv("MEDIUM_OAUTH_CALLBACK_URL");

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    redirect_uri: callbackUrl,
  });

  const data = await mediumApiFetch(MEDIUM_TOKEN_URL, tokenResponseSchema, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
  };
}

export async function getMediumUser(
  accessToken: string
): Promise<{ id: string; name: string }> {
  const data = await mediumApiFetch(`${MEDIUM_API_BASE}/me`, userResponseSchema, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  return {
    id: data.data.id,
    name: data.data.name,
  };
}

export function serializeMediumToken(token: MediumToken): string {
  return JSON.stringify(token);
}

export function parseMediumToken(raw: string): MediumToken {
  const parsed: unknown = JSON.parse(raw);
  const schema = z.object({
    accessToken: z.string(),
    refreshToken: z.string().optional(),
    authorId: z.string(),
    authorName: z.string(),
  });
  return schema.parse(parsed);
}
