import { z } from "zod";

const GOOGLE_OAUTH_DIALOG = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GBP_ACCOUNTS_URL =
  "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";
const GBP_LOCATIONS_BASE =
  "https://mybusinessbusinessinformation.googleapis.com/v1";

export const GOOGLE_BUSINESS_SCOPES = [
  "https://www.googleapis.com/auth/business.manage",
].join(" ");

// ── Types ─────────────────────────────────────────────────────────────────────

export type GoogleBusinessToken = {
  accessToken: string;
  refreshToken?: string;
  /** Google Business Profile account resource name, e.g. "accounts/123" */
  accountName: string;
  /** Location resource name, e.g. "accounts/123/locations/456" */
  locationName: string;
  /** Human-readable business name */
  businessName: string;
};

// ── Zod schemas ──────────────────────────────────────────────────────────────

const tokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  token_type: z.string(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
});

const accountListSchema = z.object({
  accounts: z
    .array(
      z.object({
        name: z.string(),
        accountName: z.string(),
        type: z.string().optional(),
        state: z.object({ status: z.string().optional() }).optional(),
      })
    )
    .optional(),
});

const locationListSchema = z.object({
  locations: z
    .array(
      z.object({
        name: z.string(),
        title: z.string().optional(),
        storefrontAddress: z
          .object({ addressLines: z.array(z.string()).optional() })
          .optional(),
      })
    )
    .optional(),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} environment variable is not set`);
  return value;
}

interface GoogleErrorResponse {
  error?: string | { message?: string; code?: number };
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
    const errObj = err.error;
    const msg =
      typeof errObj === "object"
        ? errObj.message
        : (err.error_description ?? (typeof errObj === "string" ? errObj : undefined) ?? err.message ?? response.statusText);
    throw new Error(`Google API error (${response.status}): ${msg}`);
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
 * Builds the Google OAuth 2.0 authorization URL for Business Profile access.
 */
export function buildGoogleBusinessOAuthUrl(state: string): string {
  const clientId = getRequiredEnv("GOOGLE_BUSINESS_CLIENT_ID");
  const callbackUrl = getRequiredEnv("GOOGLE_BUSINESS_OAUTH_CALLBACK_URL");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: callbackUrl,
    scope: GOOGLE_BUSINESS_SCOPES,
    state,
    access_type: "offline",
    prompt: "consent",
  });

  return `${GOOGLE_OAUTH_DIALOG}?${params.toString()}`;
}

/**
 * Exchanges an authorization code for access + refresh tokens.
 */
export async function exchangeGoogleBusinessCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string | undefined;
  expiresIn: number;
}> {
  const clientId = getRequiredEnv("GOOGLE_BUSINESS_CLIENT_ID");
  const clientSecret = getRequiredEnv("GOOGLE_BUSINESS_CLIENT_SECRET");
  const callbackUrl = getRequiredEnv("GOOGLE_BUSINESS_OAUTH_CALLBACK_URL");

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
 * Fetches the user's first Google Business Profile account and its first location.
 */
export async function getGoogleBusinessAccount(accessToken: string): Promise<{
  accountName: string;
  locationName: string;
  businessName: string;
}> {
  const accountData = await googleApiFetch(
    GBP_ACCOUNTS_URL,
    accountListSchema,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const account = accountData.accounts?.[0];
  if (!account) {
    throw new Error(
      "No Google Business Profile account found. Please create a business profile first."
    );
  }

  const locationsUrl = `${GBP_LOCATIONS_BASE}/${account.name}/locations?readMask=name,title`;
  const locationData = await googleApiFetch(
    locationsUrl,
    locationListSchema,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const location = locationData.locations?.[0];
  if (!location) {
    throw new Error(
      "No Google Business Profile location found. Please add a location to your business account."
    );
  }

  return {
    accountName: account.name,
    locationName: location.name,
    businessName: location.title ?? account.accountName,
  };
}

export function serializeGoogleBusinessToken(
  token: GoogleBusinessToken
): string {
  return JSON.stringify(token);
}

export function parseGoogleBusinessToken(raw: string): GoogleBusinessToken {
  const parsed: unknown = JSON.parse(raw);
  const schema = z.object({
    accessToken: z.string(),
    refreshToken: z.string().optional(),
    accountName: z.string(),
    locationName: z.string(),
    businessName: z.string(),
  });
  return schema.parse(parsed);
}
