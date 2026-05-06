jest.mock("@prisma/client", () => ({
  MediaType: {
    NONE: "NONE",
    IMAGE: "IMAGE",
    VIDEO: "VIDEO",
    CAROUSEL: "CAROUSEL",
  },
}));

// Mock telegram-oauth to avoid JSON parsing issues in tests
jest.mock("../auth/telegram-oauth", () => ({
  parseTelegramToken: (token: string) => JSON.parse(token) as Record<string, string>,
  verifyTelegramBotToken: jest.fn(),
  serializeTelegramToken: (data: unknown) => JSON.stringify(data),
}));

import { TelegramAdapter } from "../platforms/telegram";
import { MediaType } from "@prisma/client";

const mockFetch = jest.fn();

beforeAll(() => {
  global.fetch = mockFetch as unknown as typeof fetch;
});

beforeEach(() => {
  mockFetch.mockReset();
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function ok(data: unknown, status = 200) {
  return Promise.resolve({
    ok: true,
    status,
    statusText: "OK",
    json: () => Promise.resolve(data),
    headers: new Headers({ "content-type": "application/json" }),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  });
}

function fail(data: unknown, status = 400) {
  return Promise.resolve({
    ok: false,
    status,
    statusText: "Error",
    json: () => Promise.resolve(data),
    headers: new Headers(),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  });
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BOT_TOKEN = "123456789:ABCdefGHIjklMNOpqrSTUvwxYZ";
const CHAT_ID = "-1001234567890";
const BOT_USERNAME = "mypostflowbot";
const BOT_NAME = "PostFlow Bot";
const MESSAGE_ID = 42;

const TOKEN = JSON.stringify({
  botToken: BOT_TOKEN,
  chatId: CHAT_ID,
  botUsername: BOT_USERNAME,
  botName: BOT_NAME,
});

function sendMessageOk(messageId = MESSAGE_ID) {
  return ok({
    ok: true,
    result: { message_id: messageId, chat: { id: CHAT_ID } },
  });
}

function sendPhotoOk(messageId = MESSAGE_ID) {
  return ok({
    ok: true,
    result: { message_id: messageId, chat: { id: CHAT_ID } },
  });
}

function sendMediaGroupOk(count = 2) {
  return ok({
    ok: true,
    result: Array.from({ length: count }, (_, i) => ({
      message_id: MESSAGE_ID + i,
      chat: { id: CHAT_ID },
    })),
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("TelegramAdapter", () => {
  let adapter: TelegramAdapter;

  beforeEach(() => {
    adapter = new TelegramAdapter();
  });

  // ── publish – NONE (text-only) ─────────────────────────────────────────────

  describe("publish – NONE (text-only)", () => {
    it("sends a message and returns correct platformPostId", async () => {
      mockFetch.mockReturnValueOnce(sendMessageOk());

      const result = await adapter.publish(
        { content: "Hello Telegram!", mediaType: MediaType.NONE, mediaUrls: [] },
        "acct_123",
        TOKEN
      );

      expect(result.platformPostId).toBe(String(MESSAGE_ID));
      expect(result.publishedAt).toBeInstanceOf(Date);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(`/bot${BOT_TOKEN}/sendMessage`);
      expect(options.method).toBe("POST");

      const body = JSON.parse(options.body as string) as Record<string, unknown>;
      expect(body.chat_id).toBe(CHAT_ID);
      expect(body.text).toBe("Hello Telegram!");
    });

    it("truncates text to 4096 characters", async () => {
      mockFetch.mockReturnValueOnce(sendMessageOk());

      const longContent = "A".repeat(5000);
      await adapter.publish(
        { content: longContent, mediaType: MediaType.NONE, mediaUrls: [] },
        "acct_123",
        TOKEN
      );

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as Record<string, unknown>;
      expect((body.text as string).length).toBe(4096);
    });

    it("throws when Telegram API returns an error", async () => {
      mockFetch.mockReturnValueOnce(
        fail({ ok: false, description: "Bad Request: chat not found" }, 400)
      );

      await expect(
        adapter.publish(
          { content: "Hello!", mediaType: MediaType.NONE, mediaUrls: [] },
          "acct_123",
          TOKEN
        )
      ).rejects.toThrow("Telegram API error");
    });
  });

  // ── publish – IMAGE (single photo) ────────────────────────────────────────

  describe("publish – IMAGE (single photo)", () => {
    it("sends a photo with caption using sendPhoto", async () => {
      mockFetch.mockReturnValueOnce(sendPhotoOk());

      const result = await adapter.publish(
        {
          content: "Check this out!",
          mediaType: MediaType.IMAGE,
          mediaUrls: ["https://example.com/photo.jpg"],
        },
        "acct_123",
        TOKEN
      );

      expect(result.platformPostId).toBe(String(MESSAGE_ID));
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(`/bot${BOT_TOKEN}/sendPhoto`);

      const body = JSON.parse(options.body as string) as Record<string, unknown>;
      expect(body.photo).toBe("https://example.com/photo.jpg");
      expect(body.caption).toBe("Check this out!");
      expect(body.chat_id).toBe(CHAT_ID);
    });

    it("truncates caption to 1024 characters for single photo", async () => {
      mockFetch.mockReturnValueOnce(sendPhotoOk());

      const longCaption = "B".repeat(2000);
      await adapter.publish(
        {
          content: longCaption,
          mediaType: MediaType.IMAGE,
          mediaUrls: ["https://example.com/photo.jpg"],
        },
        "acct_123",
        TOKEN
      );

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as Record<string, unknown>;
      expect((body.caption as string).length).toBe(1024);
    });
  });

  // ── publish – IMAGE (media group) ─────────────────────────────────────────

  describe("publish – IMAGE (multiple photos → media group)", () => {
    it("sends a media group when multiple images are provided", async () => {
      mockFetch.mockReturnValueOnce(sendMediaGroupOk(3));

      const result = await adapter.publish(
        {
          content: "Gallery post!",
          mediaType: MediaType.IMAGE,
          mediaUrls: [
            "https://example.com/1.jpg",
            "https://example.com/2.jpg",
            "https://example.com/3.jpg",
          ],
        },
        "acct_123",
        TOKEN
      );

      expect(result.platformPostId).toBe(String(MESSAGE_ID));
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(`/bot${BOT_TOKEN}/sendMediaGroup`);

      const body = JSON.parse(options.body as string) as Record<string, unknown>;
      expect(Array.isArray(body.media)).toBe(true);
      expect((body.media as unknown[]).length).toBe(3);
    });

    it("caps media group at 10 images", async () => {
      mockFetch.mockReturnValueOnce(sendMediaGroupOk(10));

      await adapter.publish(
        {
          content: "Many images",
          mediaType: MediaType.IMAGE,
          mediaUrls: Array.from({ length: 12 }, (_, i) => `https://example.com/${i}.jpg`),
        },
        "acct_123",
        TOKEN
      );

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as Record<string, unknown>;
      expect((body.media as unknown[]).length).toBe(10);
    });
  });

  // ── publish – CAROUSEL ─────────────────────────────────────────────────────

  describe("publish – CAROUSEL", () => {
    it("sends CAROUSEL images as a media group", async () => {
      mockFetch.mockReturnValueOnce(sendMediaGroupOk(2));

      const result = await adapter.publish(
        {
          content: "Carousel post!",
          mediaType: MediaType.CAROUSEL,
          mediaUrls: [
            "https://example.com/slide1.jpg",
            "https://example.com/slide2.jpg",
          ],
        },
        "acct_123",
        TOKEN
      );

      expect(result.platformPostId).toBe(String(MESSAGE_ID));

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("sendMediaGroup");
    });
  });

  // ── publish – VIDEO (unsupported) ─────────────────────────────────────────

  describe("publish – VIDEO (unsupported)", () => {
    it("throws for VIDEO posts", async () => {
      await expect(
        adapter.publish(
          {
            content: "Video!",
            mediaType: MediaType.VIDEO,
            mediaUrls: ["https://example.com/video.mp4"],
          },
          "acct_123",
          TOKEN
        )
      ).rejects.toThrow("does not support VIDEO");
    });
  });

  // ── getStatus ──────────────────────────────────────────────────────────────

  describe("getStatus", () => {
    it("always returns PUBLISHED (no polling needed for Telegram)", async () => {
      const status = await adapter.getStatus(String(MESSAGE_ID), TOKEN);
      expect(status.status).toBe("PUBLISHED");
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ── deletePost ─────────────────────────────────────────────────────────────

  describe("deletePost", () => {
    it("calls deleteMessage with the correct chat_id and message_id", async () => {
      mockFetch.mockReturnValueOnce(ok({ ok: true, result: true }));

      await adapter.deletePost(String(MESSAGE_ID), TOKEN);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(`/bot${BOT_TOKEN}/deleteMessage`);

      const body = JSON.parse(options.body as string) as Record<string, unknown>;
      expect(body.chat_id).toBe(CHAT_ID);
      expect(body.message_id).toBe(MESSAGE_ID);
    });

    it("throws when deleteMessage fails", async () => {
      mockFetch.mockReturnValueOnce(
        fail({ ok: false, description: "Message can't be deleted" }, 400)
      );

      await expect(adapter.deletePost(String(MESSAGE_ID), TOKEN)).rejects.toThrow(
        "Telegram deleteMessage failed"
      );
    });
  });

  // ── getInsights ────────────────────────────────────────────────────────────

  describe("getInsights", () => {
    it("returns empty insights (Telegram Bot API has no engagement analytics)", async () => {
      const insights = await adapter.getInsights(String(MESSAGE_ID), TOKEN);
      expect(insights).toEqual({});
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
