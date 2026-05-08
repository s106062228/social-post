import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Platform } from "@prisma/client";
import { verifyDevToApiKey, serializeDevToToken } from "@/lib/auth/devto-oauth";
import { encryptToken } from "@/lib/encryption";
import { oauthLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { oauthLogger } from "@/lib/logger";

const connectBodySchema = z.object({
  apiKey: z.string().min(1, "API key is required"),
});

/**
 * POST /api/oauth/devto/connect
 *
 * Accepts a Dev.to personal API key, verifies via the Dev.to API,
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

  const { apiKey } = parsed.data;

  try {
    const { username, name } = await verifyDevToApiKey(apiKey);

    const tokenData = serializeDevToToken({ apiKey, username, name });
    const encrypted = encryptToken(tokenData);

    await prisma.socialAccount.upsert({
      where: {
        userId_platform_platformAccountId: {
          userId,
          platform: Platform.DEVTO,
          platformAccountId: username,
        },
      },
      create: {
        userId,
        platform: Platform.DEVTO,
        platformAccountId: username,
        accountName: name || username,
        encryptedToken: encrypted,
        tokenExpiresAt: null,
        scopes: "publish",
        isActive: true,
      },
      update: {
        accountName: name || username,
        encryptedToken: encrypted,
        tokenExpiresAt: null,
        isActive: true,
      },
    });

    oauthLogger.info({ userId, username }, "Dev.to account connected");

    return NextResponse.json({ success: true, username });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Authentication failed";
    oauthLogger.error({ err }, `Dev.to connect error: ${message}`);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
