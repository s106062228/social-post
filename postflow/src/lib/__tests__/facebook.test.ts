jest.mock("@prisma/client", () => ({
  MediaType: {
    NONE: "NONE",
    IMAGE: "IMAGE",
    VIDEO: "VIDEO",
    CAROUSEL: "CAROUSEL",
  },
}));

import { FacebookAdapter } from "../platforms/facebook";
import { MediaType } from "@prisma/client";

const mockFetch = jest.fn();

beforeAll(() => {
  global.fetch = mockFetch as unknown as typeof fetch;
});

beforeEach(() => {
  mockFetch.mockReset();
});

function ok(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
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

const PAGE_ID = "page_123";
const TOKEN = "test_token";

describe("FacebookAdapter", () => {
  let adapter: FacebookAdapter;

  beforeEach(() => {
    adapter = new FacebookAdapter();
  });

  // ── publish – NONE (text) ────────────────────────────────────────────────────

  describe("publish – NONE (text post)", () => {
    it("publishes a text post and returns platformPostId + publishedUrl", async () => {
      mockFetch.mockReturnValueOnce(ok({ id: "feed_abc" }));

      const result = await adapter.publish(
        { content: "Hello world", mediaType: MediaType.NONE, mediaUrls: [] },
        PAGE_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe("feed_abc");
      expect(result.publishedUrl).toBe("https://www.facebook.com/feed_abc");
      const url = (mockFetch.mock.calls[0] as [string])[0];
      expect(url).toContain(`${PAGE_ID}/feed`);
    });

    it("prefers post_id over id when both are present in response", async () => {
      mockFetch.mockReturnValueOnce(ok({ id: "raw_id", post_id: "real_post" }));

      const result = await adapter.publish(
        { content: "Hi", mediaType: MediaType.NONE, mediaUrls: [] },
        PAGE_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe("real_post");
    });

    it("schedules a future post and omits publishedUrl", async () => {
      const scheduledAt = new Date(Date.now() + 86_400_000);
      mockFetch.mockReturnValueOnce(ok({ id: "sched_post" }));

      const result = await adapter.publish(
        { content: "Future", mediaType: MediaType.NONE, mediaUrls: [], scheduledAt },
        PAGE_ID,
        TOKEN
      );

      expect(result.publishedUrl).toBeUndefined();
      const body = JSON.parse(
        ((mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string)
      );
      expect(body.published).toBe(false);
      expect(body.scheduled_publish_time).toBeGreaterThan(Date.now() / 1000);
    });

    it("throws when API returns an error response", async () => {
      mockFetch.mockReturnValueOnce(
        fail({ error: { message: "Invalid token", code: 190 } }, 400)
      );

      await expect(
        adapter.publish(
          { content: "test", mediaType: MediaType.NONE, mediaUrls: [] },
          PAGE_ID,
          TOKEN
        )
      ).rejects.toThrow("Invalid token");
    });
  });

  // ── publish – IMAGE ──────────────────────────────────────────────────────────

  describe("publish – IMAGE", () => {
    it("publishes a single image post via /photos endpoint", async () => {
      mockFetch.mockReturnValueOnce(ok({ id: "photo_1" }));

      const result = await adapter.publish(
        { content: "Caption", mediaType: MediaType.IMAGE, mediaUrls: ["https://example.com/img.jpg"] },
        PAGE_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe("photo_1");
      const url = (mockFetch.mock.calls[0] as [string])[0];
      expect(url).toContain(`${PAGE_ID}/photos`);
    });

    it("publishes a carousel when multiple image URLs are provided", async () => {
      mockFetch
        .mockReturnValueOnce(ok({ id: "p1" }))
        .mockReturnValueOnce(ok({ id: "p2" }))
        .mockReturnValueOnce(ok({ id: "carousel_post" }));

      const result = await adapter.publish(
        { content: "Multi-photo", mediaType: MediaType.IMAGE, mediaUrls: ["url1", "url2"] },
        PAGE_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe("carousel_post");
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("throws when no media URLs are provided", async () => {
      await expect(
        adapter.publish(
          { content: "Cap", mediaType: MediaType.IMAGE, mediaUrls: [] },
          PAGE_ID,
          TOKEN
        )
      ).rejects.toThrow("IMAGE post requires at least one media URL");
    });
  });

  // ── publish – VIDEO ──────────────────────────────────────────────────────────

  describe("publish – VIDEO", () => {
    it("publishes a video post via /videos endpoint", async () => {
      mockFetch.mockReturnValueOnce(ok({ id: "video_1" }));

      const result = await adapter.publish(
        { content: "Video desc", mediaType: MediaType.VIDEO, mediaUrls: ["https://example.com/v.mp4"] },
        PAGE_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe("video_1");
      const url = (mockFetch.mock.calls[0] as [string])[0];
      expect(url).toContain(`${PAGE_ID}/videos`);
    });

    it("throws when no media URL is provided", async () => {
      await expect(
        adapter.publish(
          { content: "Desc", mediaType: MediaType.VIDEO, mediaUrls: [] },
          PAGE_ID,
          TOKEN
        )
      ).rejects.toThrow("VIDEO post requires a media URL");
    });
  });

  // ── publish – CAROUSEL ───────────────────────────────────────────────────────

  describe("publish – CAROUSEL", () => {
    it("uploads individual photos then creates a multi-photo feed post", async () => {
      mockFetch
        .mockReturnValueOnce(ok({ id: "ph1" }))
        .mockReturnValueOnce(ok({ id: "ph2" }))
        .mockReturnValueOnce(ok({ id: "c_post" }));

      const result = await adapter.publish(
        { content: "Carousel", mediaType: MediaType.CAROUSEL, mediaUrls: ["u1", "u2"] },
        PAGE_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe("c_post");
      // First two calls upload photos, third creates the feed post
      const feedUrl = (mockFetch.mock.calls[2] as [string])[0];
      expect(feedUrl).toContain(`${PAGE_ID}/feed`);
    });

    it("throws when fewer than two URLs are provided", async () => {
      await expect(
        adapter.publish(
          { content: "One only", mediaType: MediaType.CAROUSEL, mediaUrls: ["u1"] },
          PAGE_ID,
          TOKEN
        )
      ).rejects.toThrow("CAROUSEL post requires at least two media URLs");
    });
  });

  // ── getStatus ────────────────────────────────────────────────────────────────

  describe("getStatus", () => {
    it("returns PUBLISHED when is_published is true", async () => {
      mockFetch.mockReturnValueOnce(ok({ id: "p1", is_published: true }));
      const status = await adapter.getStatus("p1", TOKEN);
      expect(status.status).toBe("PUBLISHED");
    });

    it("returns PROCESSING when is_published is false", async () => {
      mockFetch.mockReturnValueOnce(ok({ id: "p1", is_published: false }));
      const status = await adapter.getStatus("p1", TOKEN);
      expect(status.status).toBe("PROCESSING");
    });

    it("returns PUBLISHED when is_published is absent", async () => {
      mockFetch.mockReturnValueOnce(ok({ id: "p1" }));
      const status = await adapter.getStatus("p1", TOKEN);
      expect(status.status).toBe("PUBLISHED");
    });

    it("returns FAILED when API errors", async () => {
      mockFetch.mockReturnValueOnce(
        fail({ error: { message: "Post not found" } }, 404)
      );
      const status = await adapter.getStatus("nonexistent", TOKEN);
      expect(status.status).toBe("FAILED");
      expect(status.error).toContain("Post not found");
    });
  });

  // ── deletePost ───────────────────────────────────────────────────────────────

  describe("deletePost", () => {
    it("resolves without error on success", async () => {
      mockFetch.mockReturnValueOnce(
        Promise.resolve({ ok: true, status: 200, json: jest.fn() })
      );
      await expect(adapter.deletePost("p1", TOKEN)).resolves.toBeUndefined();
    });

    it("throws when API returns an error", async () => {
      mockFetch.mockReturnValueOnce(
        fail({ error: { message: "Cannot delete published post" } }, 403)
      );
      await expect(adapter.deletePost("p1", TOKEN)).rejects.toThrow(
        "Cannot delete published post"
      );
    });
  });

  // ── getInsights ──────────────────────────────────────────────────────────────

  describe("getInsights", () => {
    it("returns likes, comments, and shares", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          likes: { summary: { total_count: 42 } },
          comments: { summary: { total_count: 7 } },
          shares: { count: 3 },
        })
      );
      const insights = await adapter.getInsights("p1", TOKEN);
      expect(insights.likes).toBe(42);
      expect(insights.comments).toBe(7);
      expect(insights.shares).toBe(3);
    });

    it("returns empty object when API errors", async () => {
      mockFetch.mockReturnValueOnce(fail({ error: {} }, 500));
      const insights = await adapter.getInsights("p1", TOKEN);
      expect(insights).toEqual({});
    });
  });
});
