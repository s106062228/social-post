import { z } from "zod";

// ── Zod schemas ───────────────────────────────────────────────────────────────

const accountSchema = z.object({
  id: z.string(),
  username: z.string(),
  acct: z.string(),
  display_name: z.string().optional(),
});

// ── Public types ──────────────────────────────────────────────────────────────

export interface MastodonTokenData {
  instanceUrl: string;
  accessToken: string;
  accountId: string;
  username: string;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Verifies a Mastodon access token by calling the instance's
 * /api/v1/accounts/verify_credentials endpoint.
 * Returns account info on success, throws on failure.
 */
export async function verifyMastodonToken(
  instanceUrl: string,
  accessToken: string
): Promise<{ accountId: string; username: string }> {
  const url = `${instanceUrl.replace(/\/$/, "")}/api/v1/accounts/verify_credentials`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(
      `Mastodon token verification failed (${response.status}): ${response.statusText}`
    );
  }

  const data: unknown = await response.json();
  const parsed = accountSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Mastodon API response validation failed: ${parsed.error.message}`
    );
  }

  return {
    accountId: parsed.data.id,
    username: parsed.data.acct || parsed.data.username,
  };
}

/**
 * Serializes Mastodon token data to a JSON string for encrypted storage.
 */
export function serializeMastodonToken(data: MastodonTokenData): string {
  return JSON.stringify(data);
}

/**
 * Parses a stored Mastodon token JSON string.
 */
export function parseMastodonToken(token: string): MastodonTokenData {
  const parsed = JSON.parse(token) as MastodonTokenData;
  if (!parsed.instanceUrl || !parsed.accessToken || !parsed.accountId) {
    throw new Error("Invalid Mastodon token data");
  }
  return parsed;
}
