import { z } from "zod";

const DEVTO_API_BASE = "https://dev.to/api";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DevToToken = {
  apiKey: string;
  username: string;
  name: string;
};

// ── Zod schemas ───────────────────────────────────────────────────────────────

const meResponseSchema = z.object({
  id: z.number(),
  username: z.string(),
  name: z.string(),
  profile_image: z.string().optional(),
});

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Verify a Dev.to personal API key by calling /api/users/me.
 * Returns user info if the key is valid.
 */
export async function verifyDevToApiKey(
  apiKey: string
): Promise<{ username: string; name: string }> {
  const response = await fetch(`${DEVTO_API_BASE}/users/me`, {
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Dev.to API error (${response.status}): ${text}`);
  }

  const data: unknown = await response.json();
  const parsed = meResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Unexpected Dev.to API response format");
  }

  return {
    username: parsed.data.username,
    name: parsed.data.name,
  };
}

export function serializeDevToToken(token: DevToToken): string {
  return JSON.stringify(token);
}

export function parseDevToToken(raw: string): DevToToken {
  const parsed: unknown = JSON.parse(raw);
  const schema = z.object({
    apiKey: z.string(),
    username: z.string(),
    name: z.string(),
  });
  return schema.parse(parsed);
}
