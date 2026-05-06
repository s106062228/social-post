import { z } from "zod";

// ── Zod schemas ───────────────────────────────────────────────────────────────

const getMeSchema = z.object({
  ok: z.literal(true),
  result: z.object({
    id: z.number(),
    is_bot: z.literal(true),
    username: z.string(),
    first_name: z.string(),
  }),
});

// ── Public types ──────────────────────────────────────────────────────────────

export interface TelegramTokenData {
  botToken: string;
  chatId: string;
  botUsername: string;
  botName: string;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Verifies a Telegram Bot API token by calling the getMe endpoint.
 * Returns bot info on success, throws on failure.
 */
export async function verifyTelegramBotToken(
  botToken: string
): Promise<{ botId: number; botUsername: string; botName: string }> {
  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/getMe`
  );

  if (!response.ok) {
    throw new Error(
      `Telegram API request failed (${response.status}): ${response.statusText}`
    );
  }

  const data: unknown = await response.json();
  const parsed = getMeSchema.safeParse(data);

  if (!parsed.success) {
    throw new Error("Telegram bot token is invalid or bot not found");
  }

  return {
    botId: parsed.data.result.id,
    botUsername: parsed.data.result.username,
    botName: parsed.data.result.first_name,
  };
}

/**
 * Serializes Telegram token data to a JSON string for encrypted storage.
 */
export function serializeTelegramToken(data: TelegramTokenData): string {
  return JSON.stringify(data);
}

/**
 * Parses a stored Telegram token JSON string.
 */
export function parseTelegramToken(token: string): TelegramTokenData {
  const parsed = JSON.parse(token) as TelegramTokenData;
  if (!parsed.botToken || !parsed.chatId || !parsed.botUsername) {
    throw new Error("Invalid Telegram token data");
  }
  return parsed;
}
