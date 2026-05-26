import { z } from "zod";

const BEEHIIV_API_BASE = "https://api.beehiiv.com/v2";

// ── Types ─────────────────────────────────────────────────────────────────────

export type BeehiivToken = {
  apiKey: string;
  publicationId: string;
  publicationName: string;
};

// ── Zod schemas ───────────────────────────────────────────────────────────────

const publicationResponseSchema = z.object({
  data: z.object({
    id: z.string(),
    name: z.string(),
    website_url: z.string().optional().nullable(),
  }),
});

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Verify a Beehiiv API key by fetching the publication info.
 * Returns the publication name if the key is valid.
 */
export async function verifyBeehiivApiKey(
  apiKey: string,
  publicationId: string
): Promise<{ publicationName: string }> {
  const response = await fetch(
    `${BEEHIIV_API_BASE}/publications/${publicationId}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Beehiiv API error (${response.status}): ${text}`);
  }

  const data: unknown = await response.json();
  const parsed = publicationResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Unexpected Beehiiv API response format");
  }

  return {
    publicationName: parsed.data.data.name,
  };
}

export function serializeBeehiivToken(token: BeehiivToken): string {
  return JSON.stringify(token);
}

export function parseBeehiivToken(raw: string): BeehiivToken {
  const parsed: unknown = JSON.parse(raw);
  const schema = z.object({
    apiKey: z.string(),
    publicationId: z.string(),
    publicationName: z.string(),
  });
  return schema.parse(parsed);
}
