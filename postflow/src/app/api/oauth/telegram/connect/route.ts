import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Platform } from "@prisma/client";
import {
  verifyTelegramBotToken,
  serializeTelegramToken,
} from "@/lib/auth/telegram-oauth";
import { encryptToken } from "@/lib/encryption";
import { oauthLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { oauthLogger } from "@/lib/logger";

const connectBodySchema = z.object({
  botToken: z.string().min(1, "Bot token is required"),
  chatId: z
    .string()
    .min(1, "Chat ID is required")
    .regex(
      /^-?\d+$|^@[a-zA-Z0-9_]{5,}$/,
      "Chat ID must be a numeric ID or @username"
    ),
});

/**
 * POST /api/oauth/telegram/connect
 *
 * Accepts a Telegram Bot API token and target chat ID, verifies the bot token
 * via getMe, and stores the encrypted token in SocialAccount.
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

  const { botToken, chatId } = parsed.data;

  try {
    const { botUsername, botName } = await verifyTelegramBotToken(botToken);

    const tokenData = serializeTelegramToken({
      botToken,
      chatId,
      botUsername,
      botName,
    });
    const encrypted = encryptToken(tokenData);

    // Use chatId as the platform account ID so the same bot can connect to
    // different chats/channels independently
    const platformAccountId = `${botUsername}:${chatId}`;

    // Telegram bot tokens do not expire
    await prisma.socialAccount.upsert({
      where: {
        userId_platform_platformAccountId: {
          userId,
          platform: Platform.TELEGRAM,
          platformAccountId,
        },
      },
      create: {
        userId,
        platform: Platform.TELEGRAM,
        platformAccountId,
        accountName: `@${botUsername} → ${chatId}`,
        encryptedToken: encrypted,
        tokenExpiresAt: null,
        scopes: "bot",
        isActive: true,
      },
      update: {
        accountName: `@${botUsername} → ${chatId}`,
        encryptedToken: encrypted,
        tokenExpiresAt: null,
        isActive: true,
      },
    });

    oauthLogger.info(
      { userId, botUsername, chatId },
      "Telegram account connected"
    );

    return NextResponse.json({ success: true, botUsername, botName });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Authentication failed";
    oauthLogger.error({ err }, `Telegram connect error: ${message}`);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
