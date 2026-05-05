import { z } from "zod";

const LINKEDIN_OAUTH_DIALOG =
  "https://www.linkedin.com/oauth/v2/authorization";
const LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const LINKEDIN_USERINFO_URL = "https://api.linkedin.com/v2/userinfo";

export const LINKEDIN_SCOPES = "openid profile w_member_social";

// ── Zod schemas ──────────────────────────────────────────────────────────────

const tokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  token_type: z.string(),
});

const userInfoSchema = z.object({
  sub: z.string(),
  name: z.string().optional(),
  given_name: z.string().optional(),
  family_name: z.string().optional(),
  picture: z.string().optional(),
  email: z.string().optional(),
});

export type LinkedInUserInfo = z.infer<typeof userInfoSchema>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} environment variable is not set`);
  return value;
}

interface LinkedInErrorResponse {
  error?: string;
  error_description?: string;
  message?: string;
}

async function linkedInApiFetch<T>(
  url: string,
  schema: z.ZodType<T>,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, options);
  const data: unknown = await response.json();

  if (!response.ok) {
    const err = data as LinkedInErrorResponse;
    throw new Error(
      `LinkedIn API error (${response.status}): ${err.error_description ?? err.message ?? err.error ?? response.statusText}`
    );
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `LinkedIn API response validation failed: ${parsed.error.message}`
    );
  }

  return parsed.data;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Builds the LinkedIn OAuth 2.0 authorization URL.
 */
export function buildLinkedInOAuthUrl(state: string): string {
  const clientId = getRequiredEnv("LINKEDIN_CLIENT_ID");
  const callbackUrl = getRequiredEnv("LINKEDIN_OAUTH_CALLBACK_URL");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: callbackUrl,
    scope: LINKEDIN_SCOPES,
    state,
  });

  return `${LINKEDIN_OAUTH_DIALOG}?${params.toString()}`;
}

/**
 * Exchanges an authorization code for an access token (~60 days).
 */
export async function exchangeLinkedInCode(
  code: string
): Promise<{ accessToken: string; expiresIn: number }> {
  const clientId = getRequiredEnv("LINKEDIN_CLIENT_ID");
  const clientSecret = getRequiredEnv("LINKEDIN_CLIENT_SECRET");
  const callbackUrl = getRequiredEnv("LINKEDIN_OAUTH_CALLBACK_URL");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: callbackUrl,
  });

  const data = await linkedInApiFetch(LINKEDIN_TOKEN_URL, tokenResponseSchema, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

/**
 * Fetches the authenticated LinkedIn user's profile via the OpenID Connect userinfo endpoint.
 * The `sub` field contains the URN-form person ID (`urn:li:person:{id}`).
 */
export async function getLinkedInProfile(
  accessToken: string
): Promise<LinkedInUserInfo> {
  return linkedInApiFetch(LINKEDIN_USERINFO_URL, userInfoSchema, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
