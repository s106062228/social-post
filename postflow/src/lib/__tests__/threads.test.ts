jest.mock("@prisma/client", () => ({
  MediaType: {
    NONE: "NONE",
    IMAGE: "IMAGE",
    VIDEO: "VIDEO",
    CAROUSEL: "CAROUSEL",
  },
}));

import { ThreadsAdapter } from "../platforms/threads";
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

const USER_ID = "threads_user_123";
const TOKEN = "test_token";

// Threads publish flow: create container → publish → fetch permalink (3 calls for text/single image)
// Permalink fetch is wrapped in try-catch, so failure is non-fatal.

describe("ThreadsAdapter", () => {
  let adapter: ThreadsAdapter;

  beforeEach(() => {
    adapter = new ThreadsAdapter();
  });

  // ── publish – NONE (text) ────────────────────────────────────────────────────

  describe("publish – NONE (text post)", () => {
    it("creates text container, publishes it, and returns result with permalink", async () => {
      mockFetch
        .mockReturnValueOnce(ok({ id: "text_container" }))
        .mockReturnValueOnce(ok({ id: "published_post" }))
        .mockReturnValueOnce(ok({ id: "published_post", permalink: "https://www.threads.net/@user/post/abc" }));

      const result = await adapter.publish(
        { content: "Hello Threads!", mediaType: MediaType.NONE, mediaUrls: [] },
        USER_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe("published_post");
      expect(result.publishedUrl).toBe("https://www.threads.net/@user/post/abc");
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("uses graph.threads.net base URL (not graph.facebook.com)", async () => {
      mockFetch
        .mockReturnValueOnce(ok({ id: "c1" }))
        .mockReturnValueOnce(ok({ id: "p1" }))
        .mockReturnValueOnce(ok({ id: "p1" }));

      await adapter.publish(
        { content: "Hi", mediaType: MediaType.NONE, mediaUrls: [] },
        USER_ID,
        TOKEN
      );

      const url = (mockFetch.mock.calls[0] as [string])[0];
      expect(url).toContain("graph.threads.net");
      expect(url).not.toContain("graph.facebook.com");
    });

    it("returns result even when permalink fetch fails (non-fatal)", async () => {
      mockFetch
        .mockReturnValueOnce(ok({ id: "c1" }))
        .mockReturnValueOnce(ok({ id: "p1" }))
        .mockReturnValueOnce(fail({ error: {} }, 500));

      const result = await adapter.publish(
        { content: "Hello", mediaType: MediaType.NONE, mediaUrls: [] },
        USER_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe("p1");
      expect(result.publishedUrl).toBeUndefined();
    });
  });

  // ── publish – IMAGE (single) ─────────────────────────────────────────────────

  describe("publish – IMAGE (single)", () => {
    it("creates image container, publishes it", async () => {
      mockFetch
        .mockReturnValueOnce(ok({ id: "img_container" }))
        .mockReturnValueOnce(ok({ id: "img_published" }))
        .mockReturnValueOnce(ok({ id: "img_published", permalink: "https://www.threads.net/@user/post/img" }));

      const result = await adapter.publish(
        { content: "Image post", mediaType: MediaType.IMAGE, mediaUrls: ["https://example.com/img.jpg"] },
        USER_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe("img_published");
      const containerBody = JSON.parse(
        ((mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string)
      );
      expect(containerBody.media_type).toBe("IMAGE");
    });

    it("throws when no media URLs are provided", async () => {
      await expect(
        adapter.publish(
          { content: "Cap", mediaType: MediaType.IMAGE, mediaUrls: [] },
          USER_ID,
          TOKEN
        )
      ).rejects.toThrow("IMAGE post requires at least one media URL");
    });
  });

  // ── publish – IMAGE (carousel via multiple URLs) ──────────────────────────────

  describe("publish – IMAGE (carousel with multiple URLs)", () => {
    it("creates item containers, carousel container, then publishes", async () => {
      mockFetch
        .mockReturnValueOnce(ok({ id: "ci1" }))
        .mockReturnValueOnce(ok({ id: "ci2" }))
        .mockReturnValueOnce(ok({ id: "cc1" }))
        .mockReturnValueOnce(ok({ id: "cp1" }))
        .mockReturnValueOnce(ok({ id: "cp1", permalink: "https://www.threads.net/@user/post/carousel" }));

      const result = await adapter.publish(
        { content: "Multi-image", mediaType: MediaType.IMAGE, mediaUrls: ["url1", "url2"] },
        USER_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe("cp1");
      expect(mockFetch).toHaveBeenCalledTimes(5);
    });
  });

  // ── publish – VIDEO ──────────────────────────────────────────────────────────

  describe("publish – VIDEO", () => {
    it("creates video container, polls until FINISHED, then publishes", async () => {
      mockFetch
        .mockReturnValueOnce(ok({ id: "vid_container" }))
        .mockReturnValueOnce(ok({ status: "FINISHED" }))
        .mockReturnValueOnce(ok({ id: "vid_published" }))
        .mockReturnValueOnce(ok({ id: "vid_published", permalink: "https://www.threads.net/@user/post/vid" }));

      const result = await adapter.publish(
        { content: "Video post", mediaType: MediaType.VIDEO, mediaUrls: ["https://example.com/vid.mp4"] },
        USER_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe("vid_published");
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it("throws when container processing fails with ERROR and includes error_message", async () => {
      mockFetch
        .mockReturnValueOnce(ok({ id: "vid_c" }))
        .mockReturnValueOnce(ok({ status: "ERROR", error_message: "Codec not supported" }));

      await expect(
        adapter.publish(
          { content: "Bad video", mediaType: MediaType.VIDEO, mediaUrls: ["https://example.com/bad.mp4"] },
          USER_ID,
          TOKEN
        )
      ).rejects.toThrow("Codec not supported");
    });

    it("throws when no media URL is provided", async () => {
      await expect(
        adapter.publish(
          { content: "Desc", mediaType: MediaType.VIDEO, mediaUrls: [] },
          USER_ID,
          TOKEN
        )
      ).rejects.toThrow("VIDEO post requires a media URL");
    });
  });

  // ── publish – CAROUSEL ───────────────────────────────────────────────────────

  describe("publish – CAROUSEL", () => {
    it("creates item containers, carousel container, then publishes", async () => {
      mockFetch
        .mockReturnValueOnce(ok({ id: "ci1" }))
        .mockReturnValueOnce(ok({ id: "ci2" }))
        .mockReturnValueOnce(ok({ id: "cc1" }))
        .mockReturnValueOnce(ok({ id: "cp1" }))
        .mockReturnValueOnce(ok({ id: "cp1", permalink: "https://www.threads.net/@user/post/car" }));

      const result = await adapter.publish(
        { content: "Carousel post", mediaType: MediaType.CAROUSEL, mediaUrls: ["url1", "url2"] },
        USER_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe("cp1");
      // Verify carousel container body has CAROUSEL media_type
      const carouselBody = JSON.parse(
        ((mockFetch.mock.calls[2] as [string, RequestInit])[1].body as string)
      );
      expect(carouselBody.media_type).toBe("CAROUSEL");
    });

    it("throws when fewer than two URLs are provided", async () => {
      await expect(
        adapter.publish(
          { content: "Only one", mediaType: MediaType.CAROUSEL, mediaUrls: ["u1"] },
          USER_ID,
          TOKEN
        )
      ).rejects.toThrow("CAROUSEL post requires at least two media URLs");
    });
  });

  // ── getStatus ────────────────────────────────────────────────────────────────

  describe("getStatus", () => {
    it("returns PUBLISHED when status is FINISHED", async () => {
      mockFetch.mockReturnValueOnce(ok({ status: "FINISHED" }));
      const result = await adapter.getStatus("p1", TOKEN);
      expect(result.status).toBe("PUBLISHED");
    });

    it("returns PUBLISHED when status is PUBLISHED", async () => {
      mockFetch.mockReturnValueOnce(ok({ status: "PUBLISHED" }));
      const result = await adapter.getStatus("p1", TOKEN);
      expect(result.status).toBe("PUBLISHED");
    });

    it("returns PROCESSING when status is IN_PROGRESS", async () => {
      mockFetch.mockReturnValueOnce(ok({ status: "IN_PROGRESS" }));
      const result = await adapter.getStatus("p1", TOKEN);
      expect(result.status).toBe("PROCESSING");
    });

    it("returns FAILED with error_message when status is ERROR", async () => {
      mockFetch.mockReturnValueOnce(ok({ status: "ERROR", error_message: "Processing failed" }));
      const result = await adapter.getStatus("p1", TOKEN);
      expect(result.status).toBe("FAILED");
      expect(result.error).toBe("Processing failed");
    });

    it("returns FAILED with fallback message when error_message is absent", async () => {
      mockFetch.mockReturnValueOnce(ok({ status: "EXPIRED" }));
      const result = await adapter.getStatus("p1", TOKEN);
      expect(result.status).toBe("FAILED");
      expect(result.error).toContain("EXPIRED");
    });

    it("returns FAILED when API request errors", async () => {
      mockFetch.mockReturnValueOnce(fail({ error: { message: "Not found" } }, 404));
      const result = await adapter.getStatus("nonexistent", TOKEN);
      expect(result.status).toBe("FAILED");
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

    it("throws on API error", async () => {
      mockFetch.mockReturnValueOnce(
        fail({ error: { message: "Cannot delete" } }, 403)
      );
      await expect(adapter.deletePost("p1", TOKEN)).rejects.toThrow("Cannot delete");
    });
  });

  // ── getInsights ──────────────────────────────────────────────────────────────

  describe("getInsights", () => {
    it("maps views→impressions, replies→comments, reposts→shares", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          data: [
            { name: "views", period: "lifetime", value: 5000 },
            { name: "likes", period: "lifetime", value: 200 },
            { name: "replies", period: "lifetime", value: 30 },
            { name: "reposts", period: "lifetime", value: 15 },
          ],
        })
      );
      const insights = await adapter.getInsights("p1", TOKEN);
      expect(insights.impressions).toBe(5000);
      expect(insights.likes).toBe(200);
      expect(insights.comments).toBe(30);
      expect(insights.shares).toBe(15);
    });

    it("returns metrics from values array when direct value field is absent", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          data: [
            { name: "likes", period: "day", values: [{ value: 42, end_time: "2024-01-01" }] },
          ],
        })
      );
      const insights = await adapter.getInsights("p1", TOKEN);
      expect(insights.likes).toBe(42);
    });

    it("returns empty object on API error", async () => {
      mockFetch.mockReturnValueOnce(fail({ error: {} }, 500));
      const insights = await adapter.getInsights("p1", TOKEN);
      expect(insights).toEqual({});
    });
  });
});
