import { z } from "zod";

const REDDIT_OAUTH_DIALOG = "https://www.reddit.com/api/v1/authorize";
const REDDIT_TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const REDDIT_API_BASE = "https://oauth.reddit.com";

export const REDDIT_SCOPES = ["submit", "identity", "mysubreddits"].join(" ");

// ── Zod schemas ───────────────────────────────────────────────────────────────

const tokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.number().optional(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
});

const userResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon_img: z.string().optional(),
});

const subredditsResponseSchema = z.object({
  data: z.object({
    children: z.array(
      z.object({
        data: z.object({
          display_name: z.string(),
          title: z.string().optional(),
          subscriber_count: z.number().optional(),
        }),
      })
    ),
  }),
});

// ── Types ─────────────────────────────────────────────────────────────────────

export type RedditUserInfo = {
  id: string;
  username: string;
  subreddits: string[];
};

export type RedditToken = {
  accessToken: string;
  refreshToken: string;
  username: string;
  subreddits: string[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} environment variable is not set`);
  return value;
}

interface RedditErrorResponse {
  error?: string;
  message?: string;
}

async function redditApiFetch<T>(
  url: string,
  schema: z.ZodType<T>,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, options);
  const data: unknown = await response.json();

  if (!response.ok) {
    const err = data as RedditErrorResponse;
    throw new Error(
      `Reddit API error (${response.status}): ${err.error ?? err.message ?? response.statusText}`
    );
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Reddit API response validation failed: ${parsed.error.message}`
    );
  }

  return parsed.data;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function buildRedditOAuthUrl(state: string): string {
  const clientId = getRequiredEnv("REDDIT_CLIENT_ID");
  const callbackUrl = getRequiredEnv("REDDIT_OAUTH_CALLBACK_URL");

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    state,
    redirect_uri: callbackUrl,
    duration: "permanent",
    scope: REDDIT_SCOPES,
  });

  return `${REDDIT_OAUTH_DIALOG}?${params.toString()}`;
}

export async function exchangeRedditCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number | undefined;
}> {
  const clientId = getRequiredEnv("REDDIT_CLIENT_ID");
  const clientSecret = getRequiredEnv("REDDIT_CLIENT_SECRET");
  const callbackUrl = getRequiredEnv("REDDIT_OAUTH_CALLBACK_URL");

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64"
  );

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl,
  });

  const data = await redditApiFetch(REDDIT_TOKEN_URL, tokenResponseSchema, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
      "User-Agent": "PostFlow/1.0",
    },
    body: body.toString(),
  });

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? "",
    expiresIn: data.expires_in,
  };
}

export async function getRedditUser(
  accessToken: string
): Promise<RedditUserInfo> {
  const user = await redditApiFetch(
    `${REDDIT_API_BASE}/api/v1/me`,
    userResponseSchema,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "PostFlow/1.0",
      },
    }
  );

  let subreddits: string[] = [];
  try {
    const subData = await redditApiFetch(
      `${REDDIT_API_BASE}/subreddits/mine/moderator?limit=25`,
      subredditsResponseSchema,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": "PostFlow/1.0",
        },
      }
    );
    subreddits = subData.data.children.map(
      (c) => c.data.display_name
    );
  } catch {
    // non-fatal: user may not moderate any subreddits
  }

  return {
    id: user.id,
    username: user.name,
    subreddits,
  };
}

export function serializeRedditToken(token: RedditToken): string {
  return JSON.stringify(token);
}

export function parseRedditToken(raw: string): RedditToken {
  const parsed: unknown = JSON.parse(raw);
  const schema = z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
    username: z.string(),
    subreddits: z.array(z.string()),
  });
  return schema.parse(parsed);
}
