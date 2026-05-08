import { createHmac } from "crypto";
import { z } from "zod";

const GHOST_ADMIN_API_VERSION = "v5.0";

// ── Types ─────────────────────────────────────────────────────────────────────

export type GhostToken = {
  instanceUrl: string;
  adminApiKey: string;
  siteTitle: string;
  siteUrl: string;
};

// ── JWT generation ────────────────────────────────────────────────────────────

function base64UrlEncode(data: string | Buffer): string {
  const buf = typeof data === "string" ? Buffer.from(data, "utf-8") : data;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Generate a short-lived JWT (5 min) for Ghost Admin API authentication.
 * The adminApiKey must have the format `{id}:{secret}` where both are hex strings.
 */
export function generateGhostJwt(adminApiKey: string): string {
  const colonIdx = adminApiKey.indexOf(":");
  if (colonIdx === -1) {
    throw new Error("Ghost Admin API key must be in {id}:{secret} format");
  }
  const id = adminApiKey.slice(0, colonIdx);
  const secret = adminApiKey.slice(colonIdx + 1);

  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT", kid: id }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(
    JSON.stringify({ iat: now, exp: now + 300, aud: "/admin/" })
  );

  const signingKey = Buffer.from(secret, "hex");
  const hmac = createHmac("sha256", signingKey);
  hmac.update(`${header}.${payload}`);
  const signature = hmac
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  return `${header}.${payload}.${signature}`;
}

// ── Zod schemas ───────────────────────────────────────────────────────────────

const siteResponseSchema = z.object({
  site: z.object({
    title: z.string(),
    url: z.string(),
    version: z.string().optional(),
  }),
});

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Verify a Ghost Admin API key by calling the site info endpoint.
 * Returns site metadata if the key is valid.
 */
export async function verifyGhostAdminKey(
  instanceUrl: string,
  adminApiKey: string
): Promise<{ siteTitle: string; siteUrl: string }> {
  const normalizedUrl = instanceUrl.replace(/\/$/, "");
  const jwt = generateGhostJwt(adminApiKey);

  const response = await fetch(
    `${normalizedUrl}/ghost/api/admin/site/`,
    {
      headers: {
        Authorization: `Ghost ${jwt}`,
        "Accept-Version": GHOST_ADMIN_API_VERSION,
      },
    }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Ghost Admin API error (${response.status}): ${text}`);
  }

  const data: unknown = await response.json();
  const parsed = siteResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Unexpected Ghost Admin API response format");
  }

  return {
    siteTitle: parsed.data.site.title,
    siteUrl: parsed.data.site.url,
  };
}

export function serializeGhostToken(token: GhostToken): string {
  return JSON.stringify(token);
}

export function parseGhostToken(raw: string): GhostToken {
  const parsed: unknown = JSON.parse(raw);
  const schema = z.object({
    instanceUrl: z.string(),
    adminApiKey: z.string(),
    siteTitle: z.string(),
    siteUrl: z.string(),
  });
  return schema.parse(parsed);
}
