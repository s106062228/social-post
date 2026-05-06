import { z } from "zod";

const BSKY_XRPC_BASE = "https://bsky.social/xrpc";

// ── Zod schemas ──────────────────────────────────────────────────────────────

const sessionResponseSchema = z.object({
  did: z.string(),
  handle: z.string(),
  accessJwt: z.string(),
  refreshJwt: z.string(),
});

// ── Public types ─────────────────────────────────────────────────────────────

export interface BlueskyTokenData {
  did: string;
  handle: string;
  accessJwt: string;
  refreshJwt: string;
}

interface BlueskyErrorResponse {
  error?: string;
  message?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function bskyFetch<T>(
  path: string,
  schema: z.ZodType<T>,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${BSKY_XRPC_BASE}/${path}`, options);
  const data: unknown = await response.json();

  if (!response.ok) {
    const err = data as BlueskyErrorResponse;
    throw new Error(
      `Bluesky API error (${response.status}): ${err.message ?? err.error ?? response.statusText}`
    );
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Bluesky API response validation failed: ${parsed.error.message}`
    );
  }

  return parsed.data;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Authenticates with Bluesky using an identifier (handle or DID) and app password.
 * Returns session tokens for publishing.
 */
export async function createBlueskySession(
  identifier: string,
  appPassword: string
): Promise<BlueskyTokenData> {
  const data = await bskyFetch(
    "com.atproto.server.createSession",
    sessionResponseSchema,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password: appPassword }),
    }
  );

  return {
    did: data.did,
    handle: data.handle,
    accessJwt: data.accessJwt,
    refreshJwt: data.refreshJwt,
  };
}

/**
 * Refreshes a Bluesky session using the stored refresh JWT.
 * Returns updated session tokens.
 */
export async function refreshBlueskySession(
  refreshJwt: string
): Promise<BlueskyTokenData> {
  const data = await bskyFetch(
    "com.atproto.server.refreshSession",
    sessionResponseSchema,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${refreshJwt}`,
      },
    }
  );

  return {
    did: data.did,
    handle: data.handle,
    accessJwt: data.accessJwt,
    refreshJwt: data.refreshJwt,
  };
}

/**
 * Serializes Bluesky token data to a JSON string for encrypted storage.
 */
export function serializeBlueskyToken(data: BlueskyTokenData): string {
  return JSON.stringify(data);
}

/**
 * Parses a stored Bluesky token JSON string.
 */
export function parseBlueskyToken(token: string): BlueskyTokenData {
  const parsed = JSON.parse(token) as BlueskyTokenData;
  if (!parsed.did || !parsed.accessJwt || !parsed.refreshJwt) {
    throw new Error("Invalid Bluesky token data");
  }
  return parsed;
}
