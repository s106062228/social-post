import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Platform } from "@prisma/client";
import {
  verifyGhostAdminKey,
  serializeGhostToken,
} from "@/lib/auth/ghost-oauth";
import { encryptToken } from "@/lib/encryption";
import { oauthLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { oauthLogger } from "@/lib/logger";

const connectBodySchema = z.object({
  instanceUrl: z
    .string()
    .url("Instance URL must be a valid URL")
    .regex(/^https?:\/\//, "Instance URL must start with http:// or https://"),
  adminApiKey: z
    .string()
    .min(1, "Admin API key is required")
    .regex(/^[a-f0-9]+:[a-f0-9]+$/i, "Admin API key must be in {id}:{secret} format"),
});

/**
 * POST /api/oauth/ghost/connect
 *
 * Accepts a Ghost instance URL and Admin API key ({id}:{secret}),
 * verifies via the Ghost Admin API, and stores the encrypted token.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  const rl = await oauthLimiter(ip);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = connectBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { instanceUrl, adminApiKey } = parsed.data;
  const normalizedUrl = instanceUrl.replace(/\/$/, "");

  try {
    const { siteTitle, siteUrl } = await verifyGhostAdminKey(
      normalizedUrl,
      adminApiKey
    );

    const tokenData = serializeGhostToken({
      instanceUrl: normalizedUrl,
      adminApiKey,
      siteTitle,
      siteUrl,
    });
    const encrypted = encryptToken(tokenData);

    // Use the instance URL as the platform account identifier (one account per Ghost site)
    const platformAccountId = normalizedUrl;

    await prisma.socialAccount.upsert({
      where: {
        userId_platform_platformAccountId: {
          userId,
          platform: Platform.GHOST,
          platformAccountId,
        },
      },
      create: {
        userId,
        platform: Platform.GHOST,
        platformAccountId,
        accountName: siteTitle,
        encryptedToken: encrypted,
        tokenExpiresAt: null,
        scopes: "admin",
        isActive: true,
      },
      update: {
        accountName: siteTitle,
        encryptedToken: encrypted,
        tokenExpiresAt: null,
        isActive: true,
      },
    });

    oauthLogger.info(
      { userId, siteTitle, instanceUrl: normalizedUrl },
      "Ghost CMS account connected"
    );

    return NextResponse.json({ success: true, siteTitle });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Authentication failed";
    oauthLogger.error({ err }, `Ghost connect error: ${message}`);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
