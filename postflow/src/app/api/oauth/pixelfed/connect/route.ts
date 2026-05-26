import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Platform } from "@prisma/client";
import {
  verifyPixelfedToken,
  serializePixelfedToken,
} from "@/lib/auth/pixelfed-oauth";
import { encryptToken } from "@/lib/encryption";
import { oauthLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { oauthLogger } from "@/lib/logger";

const connectBodySchema = z.object({
  instanceUrl: z
    .string()
    .url("Instance URL must be a valid URL")
    .regex(/^https?:\/\//, "Instance URL must start with http:// or https://"),
  accessToken: z.string().min(1, "Access token is required"),
});

/**
 * POST /api/oauth/pixelfed/connect
 *
 * Accepts a Pixelfed instance URL and access token, verifies via the instance API,
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
      { error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { instanceUrl, accessToken } = parsed.data;

  // Normalise instance URL — strip trailing slash
  const normalizedInstance = instanceUrl.replace(/\/$/, "");

  try {
    const { accountId, username } = await verifyPixelfedToken(
      normalizedInstance,
      accessToken
    );

    const tokenData = serializePixelfedToken({
      instanceUrl: normalizedInstance,
      accessToken,
      accountId,
      username,
    });
    const encrypted = encryptToken(tokenData);

    // Pixelfed access tokens do not expire by default
    await prisma.socialAccount.upsert({
      where: {
        userId_platform_platformAccountId: {
          userId,
          platform: Platform.PIXELFED,
          platformAccountId: `${normalizedInstance}:${accountId}`,
        },
      },
      create: {
        userId,
        platform: Platform.PIXELFED,
        platformAccountId: `${normalizedInstance}:${accountId}`,
        accountName: `@${username}`,
        encryptedToken: encrypted,
        tokenExpiresAt: null,
        scopes: "read write",
        isActive: true,
      },
      update: {
        accountName: `@${username}`,
        encryptedToken: encrypted,
        tokenExpiresAt: null,
        isActive: true,
      },
    });

    oauthLogger.info(
      { userId, username, instanceUrl: normalizedInstance },
      "Pixelfed account connected"
    );

    return NextResponse.json({ success: true, username });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Authentication failed";
    oauthLogger.error({ err }, `Pixelfed connect error: ${message}`);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
