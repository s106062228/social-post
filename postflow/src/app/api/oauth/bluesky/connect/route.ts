import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Platform } from "@prisma/client";
import { createBlueskySession, serializeBlueskyToken } from "@/lib/auth/bluesky-oauth";
import { encryptToken } from "@/lib/encryption";
import { oauthLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { oauthLogger } from "@/lib/logger";

const connectBodySchema = z.object({
  identifier: z.string().min(1, "Handle or DID is required"),
  appPassword: z.string().min(1, "App password is required"),
});

/**
 * POST /api/oauth/bluesky/connect
 *
 * Accepts a Bluesky handle/DID and app password, authenticates via the AT Protocol,
 * and stores encrypted session tokens in SocialAccount.
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
      { error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { identifier, appPassword } = parsed.data;

  try {
    const tokenData = await createBlueskySession(identifier, appPassword);

    const tokenJson = serializeBlueskyToken(tokenData);
    const encrypted = encryptToken(tokenJson);
    // Access tokens expire in ~2 hours; refreshJwt is long-lived
    const tokenExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

    await prisma.socialAccount.upsert({
      where: {
        userId_platform_platformAccountId: {
          userId,
          platform: Platform.BLUESKY,
          platformAccountId: tokenData.did,
        },
      },
      create: {
        userId,
        platform: Platform.BLUESKY,
        platformAccountId: tokenData.did,
        accountName: tokenData.handle,
        encryptedToken: encrypted,
        tokenExpiresAt,
        scopes: "atproto",
        isActive: true,
      },
      update: {
        accountName: tokenData.handle,
        encryptedToken: encrypted,
        tokenExpiresAt,
        isActive: true,
      },
    });

    oauthLogger.info({ userId, handle: tokenData.handle }, "Bluesky account connected");

    return NextResponse.json({ success: true, handle: tokenData.handle });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Authentication failed";
    oauthLogger.error({ err }, `Bluesky connect error: ${message}`);

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
