import { z } from "zod";

const TUMBLR_OAUTH_DIALOG = "https://www.tumblr.com/oauth2/authorize";
const TUMBLR_TOKEN_URL = "https://api.tumblr.com/v2/oauth2/token";
const TUMBLR_API_BASE = "https://api.tumblr.com/v2";

export const TUMBLR_SCOPES = ["basic", "write", "offline_access"].join(" ");

// ── Zod schemas ───────────────────────────────────────────────────────────────

const tokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.number().optional(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
});

const userInfoResponseSchema = z.object({
  meta: z.object({ status: z.number(), msg: z.string() }),
  response: z.object({
    user: z.object({
      name: z.string(),
      blogs: z
        .array(
          z.object({
            name: z.string(),
            url: z.string().optional(),
            primary: z.boolean().optional(),
          })
        )
        .optional(),
    }),
  }),
});

// ── Types ─────────────────────────────────────────────────────────────────────

export type TumblrBlog = {
  name: string;
  url?: string;
  isPrimary: boolean;
};

export type TumblrUserInfo = {
  username: string;
  primaryBlog: string;
  blogs: TumblrBlog[];
};

export type TumblrToken = {
  accessToken: string;
  refreshToken: string;
  username: string;
  primaryBlog: string;
  blogs: TumblrBlog[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} environment variable is not set`);
  return value;
}

interface TumblrErrorResponse {
  meta?: { status?: number; msg?: string };
  errors?: Array<{ code?: number; title?: string; detail?: string }>;
}

async function tumblrApiFetch<T>(
  url: string,
  schema: z.ZodType<T>,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, options);
  const data: unknown = await response.json();

  if (!response.ok) {
    const err = data as TumblrErrorResponse;
    const detail =
      err.errors?.[0]?.detail ??
      err.errors?.[0]?.title ??
      err.meta?.msg ??
      response.statusText;
    throw new Error(`Tumblr API error (${response.status}): ${detail}`);
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Tumblr API response validation failed: ${parsed.error.message}`
    );
  }

  return parsed.data;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function buildTumblrOAuthUrl(state: string): string {
  const clientId = getRequiredEnv("TUMBLR_CLIENT_ID");
  const callbackUrl = getRequiredEnv("TUMBLR_OAUTH_CALLBACK_URL");

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: TUMBLR_SCOPES,
    state,
    redirect_uri: callbackUrl,
  });

  return `${TUMBLR_OAUTH_DIALOG}?${params.toString()}`;
}

export async function exchangeTumblrCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number | undefined;
}> {
  const clientId = getRequiredEnv("TUMBLR_CLIENT_ID");
  const clientSecret = getRequiredEnv("TUMBLR_CLIENT_SECRET");
  const callbackUrl = getRequiredEnv("TUMBLR_OAUTH_CALLBACK_URL");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const tokenSchema = z.object({
    access_token: z.string(),
    token_type: z.string(),
    expires_in: z.number().optional(),
    refresh_token: z.string().optional(),
    scope: z.string().optional(),
  });

  const data = await tumblrApiFetch(TUMBLR_TOKEN_URL, tokenSchema, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? "",
    expiresIn: data.expires_in,
  };
}

export async function getTumblrUser(
  accessToken: string
): Promise<TumblrUserInfo> {
  const data = await tumblrApiFetch(
    `${TUMBLR_API_BASE}/user/info`,
    userInfoResponseSchema,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  const { user } = data.response;
  const blogs: TumblrBlog[] = (user.blogs ?? []).map((b) => ({
    name: b.name,
    url: b.url,
    isPrimary: b.primary ?? false,
  }));

  const primaryBlog =
    blogs.find((b) => b.isPrimary)?.name ?? blogs[0]?.name ?? user.name;

  return {
    username: user.name,
    primaryBlog,
    blogs,
  };
}

export function serializeTumblrToken(token: TumblrToken): string {
  return JSON.stringify(token);
}

export function parseTumblrToken(raw: string): TumblrToken {
  const parsed: unknown = JSON.parse(raw);
  const schema = z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
    username: z.string(),
    primaryBlog: z.string(),
    blogs: z.array(
      z.object({
        name: z.string(),
        url: z.string().optional(),
        isPrimary: z.boolean(),
      })
    ),
  });
  return schema.parse(parsed);
}

// Keep tokenResponseSchema exported for reuse in token refresh
export { tokenResponseSchema as tumblrTokenResponseSchema };
