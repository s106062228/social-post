import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Platform } from "@prisma/client";
import {
  verifyNostrPrivateKey,
  serializeNostrToken,
} from "@/lib/auth/nostr-oauth";
import { encryptToken } from "@/lib/encryption";
import { oauthLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { oauthLogger } from "@/lib/logger";

const RELAY_URL_REGEX = /^wss?:\/\//;

const connectBodySchema = z.object({
  privateKey: z.string().min(1, "Private key is required"),
  relayUrls: z
    .array(z.string().regex(RELAY_URL_REGEX, "Relay URL must start with wss:// or ws://"))
    .min(1, "At least one relay URL is required")
    .max(10, "Maximum 10 relay URLs allowed"),
});

/**
 * POST /api/oauth/nostr/connect
 *
 * Accepts a Nostr private key (hex or nsec) and relay URLs, derives the public
 * key, and stores the encrypted key bundle in SocialAccount.
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

  const { privateKey: privateKeyInput, relayUrls } = parsed.data;

  try {
    const { privateKey, publicKey } = verifyNostrPrivateKey(privateKeyInput);

    const tokenData = serializeNostrToken({ privateKey, publicKey, relayUrls });
    const encrypted = encryptToken(tokenData);

    // Nostr keys do not expire
    await prisma.socialAccount.upsert({
      where: {
        userId_platform_platformAccountId: {
          userId,
          platform: Platform.NOSTR,
          platformAccountId: publicKey,
        },
      },
      create: {
        userId,
        platform: Platform.NOSTR,
        platformAccountId: publicKey,
        accountName: `npub:${publicKey.slice(0, 8)}…`,
        encryptedToken: encrypted,
        tokenExpiresAt: null,
        scopes: "write",
        isActive: true,
      },
      update: {
        accountName: `npub:${publicKey.slice(0, 8)}…`,
        encryptedToken: encrypted,
        tokenExpiresAt: null,
        isActive: true,
      },
    });

    oauthLogger.info({ userId, publicKey }, "Nostr account connected");

    return NextResponse.json({ success: true, publicKey });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Authentication failed";
    oauthLogger.error({ err }, `Nostr connect error: ${message}`);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
