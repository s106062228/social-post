jest.mock("@prisma/client", () => ({
  MediaType: {
    NONE: "NONE",
    IMAGE: "IMAGE",
    VIDEO: "VIDEO",
    CAROUSEL: "CAROUSEL",
  },
}));

import { PinterestAdapter } from "../platforms/pinterest";
import { MediaType } from "@prisma/client";

const mockFetch = jest.fn();

beforeAll(() => {
  global.fetch = mockFetch as unknown as typeof fetch;
});

beforeEach(() => {
  mockFetch.mockReset();
});

function ok(data: unknown, status = 200) {
  return Promise.resolve({
    ok: true,
    status,
    statusText: "OK",
    json: () => Promise.resolve(data),
  });
}

function fail(data: unknown, status = 400) {
  return Promise.resolve({
    ok: false,
    status,
    statusText: "Error",
    json: () => Promise.resolve(data),
  });
}

const BOARD_ID = "123456789012345678";
const TOKEN = "test_pinterest_token";
const PIN_ID = "987654321098765432";

describe("PinterestAdapter", () => {
  let adapter: PinterestAdapter;

  beforeEach(() => {
    adapter = new PinterestAdapter();
  });

  // ── publish – IMAGE ───────────────────────────────────────────────────────

  describe("publish – IMAGE", () => {
    it("publishes an image pin and returns platformPostId + publishedUrl", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ id: PIN_ID, link: `https://www.pinterest.com/pin/${PIN_ID}/` })
      );

      const result = await adapter.publish(
        {
          content: "Check out this image!",
          mediaType: MediaType.IMAGE,
          mediaUrls: ["https://example.com/image.jpg"],
        },
        BOARD_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe(PIN_ID);
      expect(result.publishedUrl).toContain(PIN_ID);
      expect(result.publishedAt).toBeInstanceOf(Date);

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/v5/pins");
      expect((options.headers as Record<string, string>)["Authorization"]).toBe(
        `Bearer ${TOKEN}`
      );

      const body = JSON.parse(options.body as string) as Record<string, unknown>;
      expect(body.board_id).toBe(BOARD_ID);
      expect(
        (body.media_source as Record<string, string>).source_type
      ).toBe("image_url");
      expect(
        (body.media_source as Record<string, string>).url
      ).toBe("https://example.com/image.jpg");
    });

    it("falls back to constructed URL when API does not return link", async () => {
      mockFetch.mockReturnValueOnce(ok({ id: PIN_ID }));

      const result = await adapter.publish(
        {
          content: "No link returned",
          mediaType: MediaType.IMAGE,
          mediaUrls: ["https://example.com/image.jpg"],
        },
        BOARD_ID,
        TOKEN
      );

      expect(result.publishedUrl).toBe(`https://www.pinterest.com/pin/${PIN_ID}/`);
    });

    it("truncates content to 100 chars for title", async () => {
      mockFetch.mockReturnValueOnce(ok({ id: PIN_ID }));

      const longContent = "A".repeat(200);
      await adapter.publish(
        { content: longContent, mediaType: MediaType.IMAGE, mediaUrls: ["https://example.com/img.jpg"] },
        BOARD_ID,
        TOKEN
      );

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as Record<string, unknown>;
      expect((body.title as string).length).toBe(100);
      expect((body.description as string).length).toBe(200);
    });

    it("throws when IMAGE post has no media URLs", async () => {
      await expect(
        adapter.publish(
          { content: "test", mediaType: MediaType.IMAGE, mediaUrls: [] },
          BOARD_ID,
          TOKEN
        )
      ).rejects.toThrow("IMAGE post requires at least one media URL");
    });

    it("throws when API returns error", async () => {
      mockFetch.mockReturnValueOnce(
        fail({ message: "Board not found" }, 404)
      );

      await expect(
        adapter.publish(
          {
            content: "test",
            mediaType: MediaType.IMAGE,
            mediaUrls: ["https://example.com/image.jpg"],
          },
          BOARD_ID,
          TOKEN
        )
      ).rejects.toThrow("Pinterest API error (404): Board not found");
    });
  });

  // ── publish – unsupported types ───────────────────────────────────────────

  describe("publish – unsupported types", () => {
    it("throws for NONE (text-only) posts", async () => {
      await expect(
        adapter.publish(
          { content: "text only", mediaType: MediaType.NONE, mediaUrls: [] },
          BOARD_ID,
          TOKEN
        )
      ).rejects.toThrow("Pinterest requires image content");
    });

    it("throws for VIDEO posts", async () => {
      await expect(
        adapter.publish(
          {
            content: "video",
            mediaType: MediaType.VIDEO,
            mediaUrls: ["https://example.com/video.mp4"],
          },
          BOARD_ID,
          TOKEN
        )
      ).rejects.toThrow("Pinterest adapter does not yet support VIDEO posts");
    });

    it("throws for CAROUSEL posts", async () => {
      await expect(
        adapter.publish(
          {
            content: "carousel",
            mediaType: MediaType.CAROUSEL,
            mediaUrls: ["https://example.com/1.jpg"],
          },
          BOARD_ID,
          TOKEN
        )
      ).rejects.toThrow("Pinterest adapter does not yet support CAROUSEL posts");
    });
  });

  // ── getStatus ────────────────────────────────────────────────────────────

  describe("getStatus", () => {
    it("returns PUBLISHED for a published pin", async () => {
      mockFetch.mockReturnValueOnce(ok({ id: PIN_ID, status: "PUBLISHED" }));

      const status = await adapter.getStatus(PIN_ID, TOKEN);
      expect(status.status).toBe("PUBLISHED");
    });

    it("returns PROCESSING when status is DRAFT", async () => {
      mockFetch.mockReturnValueOnce(ok({ id: PIN_ID, status: "DRAFT" }));

      const status = await adapter.getStatus(PIN_ID, TOKEN);
      expect(status.status).toBe("PROCESSING");
    });

    it("returns PUBLISHED when status field is absent", async () => {
      mockFetch.mockReturnValueOnce(ok({ id: PIN_ID }));

      const status = await adapter.getStatus(PIN_ID, TOKEN);
      expect(status.status).toBe("PUBLISHED");
    });

    it("returns FAILED on API error", async () => {
      mockFetch.mockReturnValueOnce(fail({ message: "Not found" }, 404));

      const status = await adapter.getStatus(PIN_ID, TOKEN);
      expect(status.status).toBe("FAILED");
      expect(status.error).toBeDefined();
    });
  });

  // ── deletePost ───────────────────────────────────────────────────────────

  describe("deletePost", () => {
    it("sends DELETE request successfully", async () => {
      mockFetch.mockReturnValueOnce(
        Promise.resolve({
          ok: true,
          status: 204,
          statusText: "No Content",
          json: () => Promise.resolve({}),
        })
      );

      await expect(adapter.deletePost(PIN_ID, TOKEN)).resolves.toBeUndefined();

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(encodeURIComponent(PIN_ID));
      expect(options.method).toBe("DELETE");
    });

    it("throws on delete error", async () => {
      mockFetch.mockReturnValueOnce(
        Promise.resolve({
          ok: false,
          status: 403,
          statusText: "Forbidden",
          json: () => Promise.resolve({ message: "Permission denied" }),
        })
      );

      await expect(adapter.deletePost(PIN_ID, TOKEN)).rejects.toThrow(
        "Pinterest delete error (403): Permission denied"
      );
    });
  });

  // ── getInsights ──────────────────────────────────────────────────────────

  describe("getInsights", () => {
    it("returns engagement metrics from pin analytics", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          all: {
            summary_metrics: {
              IMPRESSION: 1000,
              OUTBOUND_CLICK: 50,
              PIN_CLICK: 200,
              SAVE: 30,
            },
          },
        })
      );

      const insights = await adapter.getInsights(PIN_ID, TOKEN);
      expect(insights.impressions).toBe(1000);
      expect(insights.reach).toBe(50);
      expect(insights.likes).toBe(200);
      expect(insights.shares).toBe(30);
    });

    it("returns empty object when API fails", async () => {
      mockFetch.mockReturnValueOnce(fail({ message: "Error" }, 500));

      const insights = await adapter.getInsights(PIN_ID, TOKEN);
      expect(insights).toEqual({});
    });

    it("returns empty object when summary_metrics is absent", async () => {
      mockFetch.mockReturnValueOnce(ok({ all: {} }));

      const insights = await adapter.getInsights(PIN_ID, TOKEN);
      expect(insights).toEqual({});
    });
  });
});
