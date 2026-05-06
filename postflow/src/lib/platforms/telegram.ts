import { z } from "zod";
import { MediaType } from "@prisma/client";
import {
  PostContent,
  PublishResult,
  PostStatus,
  Insights,
  PlatformAdapter,
} from "./types";
import { parseTelegramToken } from "@/lib/auth/telegram-oauth";

const TELEGRAM_CAPTION_LIMIT = 1024;
const TELEGRAM_TEXT_LIMIT = 4096;

// ── Zod schemas ───────────────────────────────────────────────────────────────

const sendMessageResponseSchema = z.object({
  ok: z.literal(true),
  result: z.object({
    message_id: z.number(),
    chat: z.object({ id: z.union([z.number(), z.string()]) }),
  }),
});

const sendPhotoResponseSchema = z.object({
  ok: z.literal(true),
  result: z.object({
    message_id: z.number(),
    chat: z.object({ id: z.union([z.number(), z.string()]) }),
  }),
});

const mediaGroupResponseSchema = z.object({
  ok: z.literal(true),
  result: z.array(
    z.object({
      message_id: z.number(),
      chat: z.object({ id: z.union([z.number(), z.string()]) }),
    })
  ),
});

// ── Internal helpers ──────────────────────────────────────────────────────────

interface TelegramErrorBody {
  ok: false;
  description?: string;
  error_code?: number;
}

function telegramApiUrl(botToken: string, method: string): string {
  return `https://api.telegram.org/bot${botToken}/${method}`;
}

async function telegramPost<T>(
  botToken: string,
  method: string,
  schema: z.ZodType<T>,
  body: Record<string, unknown> | FormData
): Promise<T> {
  const isFormData = body instanceof FormData;
  const response = await fetch(telegramApiUrl(botToken, method), {
    method: "POST",
    headers: isFormData ? {} : { "Content-Type": "application/json" },
    body: isFormData ? body : JSON.stringify(body),
  });

  const data: unknown = await response.json();

  if (!response.ok) {
    const err = data as TelegramErrorBody;
    throw new Error(
      `Telegram API error (${response.status}): ${err.description ?? response.statusText}`
    );
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Telegram API response validation failed: ${parsed.error.message}`
    );
  }

  return parsed.data;
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class TelegramAdapter implements PlatformAdapter {
  async publish(
    post: PostContent,
    _accountId: string,
    token: string
  ): Promise<PublishResult> {
    const { botToken, chatId } = parseTelegramToken(token);

    if (post.mediaType === MediaType.VIDEO) {
      throw new Error("Telegram adapter does not support VIDEO posts");
    }

    if (post.mediaType === MediaType.CAROUSEL && post.mediaUrls.length > 0) {
      return this.publishMediaGroup(post, botToken, chatId);
    }

    if (post.mediaType === MediaType.IMAGE && post.mediaUrls.length === 1) {
      return this.publishPhoto(post, botToken, chatId);
    }

    if (post.mediaType === MediaType.IMAGE && post.mediaUrls.length > 1) {
      return this.publishMediaGroup(post, botToken, chatId);
    }

    // NONE — plain text message
    const text = post.content.slice(0, TELEGRAM_TEXT_LIMIT);
    const result = await telegramPost(
      botToken,
      "sendMessage",
      sendMessageResponseSchema,
      { chat_id: chatId, text, parse_mode: "HTML" }
    );

    const messageId = result.result.message_id.toString();
    return {
      platformPostId: messageId,
      publishedUrl: undefined,
      publishedAt: new Date(),
    };
  }

  async getStatus(
    _platformPostId: string,
    _token: string
  ): Promise<PostStatus> {
    // Telegram has no status polling for already-sent messages
    return { status: "PUBLISHED" };
  }

  async deletePost(platformPostId: string, token: string): Promise<void> {
    const { botToken, chatId } = parseTelegramToken(token);

    const response = await fetch(
      telegramApiUrl(botToken, "deleteMessage"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: parseInt(platformPostId, 10),
        }),
      }
    );

    if (!response.ok) {
      const data = (await response.json()) as TelegramErrorBody;
      throw new Error(
        `Telegram deleteMessage failed (${response.status}): ${data.description ?? response.statusText}`
      );
    }
  }

  async getInsights(
    _platformPostId: string,
    _token: string
  ): Promise<Insights> {
    // Telegram Bot API does not expose engagement analytics
    return {};
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async publishPhoto(
    post: PostContent,
    botToken: string,
    chatId: string
  ): Promise<PublishResult> {
    const caption = post.content.slice(0, TELEGRAM_CAPTION_LIMIT);
    const photoUrl = post.mediaUrls[0];

    const result = await telegramPost(
      botToken,
      "sendPhoto",
      sendPhotoResponseSchema,
      { chat_id: chatId, photo: photoUrl, caption, parse_mode: "HTML" }
    );

    return {
      platformPostId: result.result.message_id.toString(),
      publishedUrl: undefined,
      publishedAt: new Date(),
    };
  }

  private async publishMediaGroup(
    post: PostContent,
    botToken: string,
    chatId: string
  ): Promise<PublishResult> {
    const urls = post.mediaUrls.slice(0, 10); // Telegram supports up to 10 in a media group
    const caption = post.content.slice(0, TELEGRAM_CAPTION_LIMIT);

    const media = urls.map((url, index) => ({
      type: "photo",
      media: url,
      ...(index === 0 ? { caption, parse_mode: "HTML" } : {}),
    }));

    const result = await telegramPost(
      botToken,
      "sendMediaGroup",
      mediaGroupResponseSchema,
      { chat_id: chatId, media }
    );

    const firstMessageId = result.result[0]?.message_id.toString() ?? "0";
    return {
      platformPostId: firstMessageId,
      publishedUrl: undefined,
      publishedAt: new Date(),
    };
  }
}

export const telegramAdapter = new TelegramAdapter();
