import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Platform } from "@prisma/client";
import {
  verifyBeehiivApiKey,
  serializeBeehiivToken,
} from "@/lib/auth/beehiiv-oauth";
import { encryptToken } from "@/lib/encryption";
import { oauthLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { oauthLogger } from "@/lib/logger";

const connectBodySchema = z.object({
  apiKey: z.string().min(1, "API key is required"),
  publicationId: z.string().min(1, "Publication ID is required"),
});

/**
 * POST /api/oauth/beehiiv/connect
 *
 * Accepts a Beehiiv API key and publication ID, verifies via the Beehiiv API,
 * and stores the encrypted token in SocialAccount.
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

  const { apiKey, publicationId } = parsed.data;

  try {
    const { publicationName } = await verifyBeehiivApiKey(apiKey, publicationId);

    const tokenData = serializeBeehiivToken({
      apiKey,
      publicationId,
      publicationName,
    });
    const encrypted = encryptToken(tokenData);

    await prisma.socialAccount.upsert({
      where: {
        userId_platform_platformAccountId: {
          userId,
          platform: Platform.BEEHIIV,
          platformAccountId: publicationId,
        },
      },
      create: {
        userId,
        platform: Platform.BEEHIIV,
        platformAccountId: publicationId,
        accountName: publicationName,
        encryptedToken: encrypted,
        tokenExpiresAt: null,
        scopes: "publish",
        isActive: true,
      },
      update: {
        accountName: publicationName,
        encryptedToken: encrypted,
        tokenExpiresAt: null,
        isActive: true,
      },
    });

    oauthLogger.info(
      { userId, publicationId, publicationName },
      "Beehiiv account connected"
    );

    return NextResponse.json({ success: true, publicationName });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Authentication failed";
    oauthLogger.error({ err }, `Beehiiv connect error: ${message}`);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
