jest.mock("@prisma/client", () => ({
  MediaType: {
    NONE: "NONE",
    IMAGE: "IMAGE",
    VIDEO: "VIDEO",
    CAROUSEL: "CAROUSEL",
  },
}));

import { InstagramAdapter } from "../platforms/instagram";
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

const IG_USER_ID = "ig_user_123";
const TOKEN = "test_token";

// Instagram publish flow: create container → publish → fetch media info (3 calls for single image)

describe("InstagramAdapter", () => {
  let adapter: InstagramAdapter;

  beforeEach(() => {
    adapter = new InstagramAdapter();
  });

  // ── publish – IMAGE (single) ─────────────────────────────────────────────────

  describe("publish – IMAGE (single)", () => {
    it("creates container, publishes it, and returns media info", async () => {
      mockFetch
        .mockReturnValueOnce(ok({ id: "container_1" }))
        .mockReturnValueOnce(ok({ id: "media_1" }))
        .mockReturnValueOnce(ok({ id: "media_1", permalink: "https://www.instagram.com/p/abc" }));

      const result = await adapter.publish(
        { content: "Caption", mediaType: MediaType.IMAGE, mediaUrls: ["https://example.com/img.jpg"] },
        IG_USER_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe("media_1");
      expect(result.publishedUrl).toBe("https://www.instagram.com/p/abc");
      expect(mockFetch).toHaveBeenCalledTimes(3);
      const containerUrl = (mockFetch.mock.calls[0] as [string])[0];
      const publishUrl = (mockFetch.mock.calls[1] as [string])[0];
      expect(containerUrl).toContain(`${IG_USER_ID}/media`);
      expect(publishUrl).toContain(`${IG_USER_ID}/media_publish`);
    });

    it("uses graph.facebook.com base URL", async () => {
      mockFetch
        .mockReturnValueOnce(ok({ id: "c1" }))
        .mockReturnValueOnce(ok({ id: "m1" }))
        .mockReturnValueOnce(ok({ id: "m1" }));

      await adapter.publish(
        { content: "Cap", mediaType: MediaType.IMAGE, mediaUrls: ["https://example.com/img.jpg"] },
        IG_USER_ID,
        TOKEN
      );

      const url = (mockFetch.mock.calls[0] as [string])[0];
      expect(url).toContain("graph.facebook.com");
    });

    it("throws when no media URLs are provided", async () => {
      await expect(
        adapter.publish(
          { content: "Cap", mediaType: MediaType.IMAGE, mediaUrls: [] },
          IG_USER_ID,
          TOKEN
        )
      ).rejects.toThrow("IMAGE post requires at least one media URL");
    });
  });

  // ── publish – IMAGE (carousel via multiple URLs) ──────────────────────────────

  describe("publish – IMAGE (carousel with multiple URLs)", () => {
    it("creates item containers, a carousel container, then publishes", async () => {
      mockFetch
        .mockReturnValueOnce(ok({ id: "item1" }))
        .mockReturnValueOnce(ok({ id: "item2" }))
        .mockReturnValueOnce(ok({ id: "carousel_c" }))
        .mockReturnValueOnce(ok({ id: "pub_media" }))
        .mockReturnValueOnce(ok({ id: "pub_media", permalink: "https://www.instagram.com/p/xyz" }));

      const result = await adapter.publish(
        { content: "Multi-photo", mediaType: MediaType.IMAGE, mediaUrls: ["url1", "url2"] },
        IG_USER_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe("pub_media");
      expect(result.publishedUrl).toBe("https://www.instagram.com/p/xyz");
      expect(mockFetch).toHaveBeenCalledTimes(5);
    });
  });

  // ── publish – VIDEO ──────────────────────────────────────────────────────────

  describe("publish – VIDEO", () => {
    it("creates container, polls until FINISHED, then publishes", async () => {
      mockFetch
        .mockReturnValueOnce(ok({ id: "v_container" }))
        .mockReturnValueOnce(ok({ status_code: "FINISHED" }))
        .mockReturnValueOnce(ok({ id: "v_media" }))
        .mockReturnValueOnce(ok({ id: "v_media", permalink: "https://www.instagram.com/reel/abc" }));

      const result = await adapter.publish(
        { content: "Reel caption", mediaType: MediaType.VIDEO, mediaUrls: ["https://example.com/vid.mp4"] },
        IG_USER_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe("v_media");
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it("throws when container processing fails with ERROR", async () => {
      mockFetch
        .mockReturnValueOnce(ok({ id: "v_c" }))
        .mockReturnValueOnce(ok({ status_code: "ERROR" }));

      await expect(
        adapter.publish(
          { content: "Bad video", mediaType: MediaType.VIDEO, mediaUrls: ["https://example.com/bad.mp4"] },
          IG_USER_ID,
          TOKEN
        )
      ).rejects.toThrow("ERROR");
    });

    it("throws when no media URL is provided", async () => {
      await expect(
        adapter.publish(
          { content: "Desc", mediaType: MediaType.VIDEO, mediaUrls: [] },
          IG_USER_ID,
          TOKEN
        )
      ).rejects.toThrow("VIDEO post requires a media URL");
    });
  });

  // ── publish – CAROUSEL ───────────────────────────────────────────────────────

  describe("publish – CAROUSEL", () => {
    it("creates item containers, carousel container, then publishes", async () => {
      mockFetch
        .mockReturnValueOnce(ok({ id: "c_item1" }))
        .mockReturnValueOnce(ok({ id: "c_item2" }))
        .mockReturnValueOnce(ok({ id: "c_container" }))
        .mockReturnValueOnce(ok({ id: "c_published" }))
        .mockReturnValueOnce(ok({ id: "c_published", permalink: "https://www.instagram.com/p/carousel" }));

      const result = await adapter.publish(
        { content: "Carousel caption", mediaType: MediaType.CAROUSEL, mediaUrls: ["url1", "url2"] },
        IG_USER_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe("c_published");
      expect(mockFetch).toHaveBeenCalledTimes(5);
    });

    it("throws when fewer than two URLs are provided", async () => {
      await expect(
        adapter.publish(
          { content: "Only one", mediaType: MediaType.CAROUSEL, mediaUrls: ["url1"] },
          IG_USER_ID,
          TOKEN
        )
      ).rejects.toThrow("CAROUSEL post requires at least two media URLs");
    });
  });

  // ── publish – NONE (text) ────────────────────────────────────────────────────

  describe("publish – NONE (text-only)", () => {
    it("throws because Instagram does not support text-only posts", async () => {
      await expect(
        adapter.publish(
          { content: "Text only", mediaType: MediaType.NONE, mediaUrls: [] },
          IG_USER_ID,
          TOKEN
        )
      ).rejects.toThrow("Instagram requires media");
    });
  });

  // ── getStatus ────────────────────────────────────────────────────────────────

  describe("getStatus", () => {
    it("returns PUBLISHED when status_code is FINISHED", async () => {
      mockFetch.mockReturnValueOnce(ok({ status_code: "FINISHED" }));
      const status = await adapter.getStatus("p1", TOKEN);
      expect(status.status).toBe("PUBLISHED");
    });

    it("returns PUBLISHED when status_code is PUBLISHED", async () => {
      mockFetch.mockReturnValueOnce(ok({ status_code: "PUBLISHED" }));
      const status = await adapter.getStatus("p1", TOKEN);
      expect(status.status).toBe("PUBLISHED");
    });

    it("returns PROCESSING when status_code is IN_PROGRESS", async () => {
      mockFetch.mockReturnValueOnce(ok({ status_code: "IN_PROGRESS" }));
      const status = await adapter.getStatus("p1", TOKEN);
      expect(status.status).toBe("PROCESSING");
    });

    it("returns FAILED when status_code is ERROR", async () => {
      mockFetch.mockReturnValueOnce(ok({ status_code: "ERROR" }));
      const status = await adapter.getStatus("p1", TOKEN);
      expect(status.status).toBe("FAILED");
      expect(status.error).toContain("ERROR");
    });

    it("returns FAILED when status_code is EXPIRED", async () => {
      mockFetch.mockReturnValueOnce(ok({ status_code: "EXPIRED" }));
      const status = await adapter.getStatus("p1", TOKEN);
      expect(status.status).toBe("FAILED");
    });

    it("returns FAILED when API request errors", async () => {
      mockFetch.mockReturnValueOnce(fail({ error: { message: "Post not found" } }, 404));
      const status = await adapter.getStatus("nonexistent", TOKEN);
      expect(status.status).toBe("FAILED");
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
        fail({ error: { message: "Permission denied" } }, 403)
      );
      await expect(adapter.deletePost("p1", TOKEN)).rejects.toThrow("Permission denied");
    });
  });

  // ── getInsights ──────────────────────────────────────────────────────────────

  describe("getInsights", () => {
    it("returns metrics from array-form values", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          data: [
            { name: "impressions", values: [{ value: 1000 }] },
            { name: "reach", values: [{ value: 800 }] },
            { name: "likes", values: [{ value: 50 }] },
            { name: "comments", values: [{ value: 10 }] },
            { name: "shares", values: [{ value: 5 }] },
          ],
        })
      );
      const insights = await adapter.getInsights("p1", TOKEN);
      expect(insights.impressions).toBe(1000);
      expect(insights.reach).toBe(800);
      expect(insights.likes).toBe(50);
      expect(insights.comments).toBe(10);
      expect(insights.shares).toBe(5);
    });

    it("returns metrics from direct value field", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          data: [{ name: "likes", value: 99 }],
        })
      );
      const insights = await adapter.getInsights("p1", TOKEN);
      expect(insights.likes).toBe(99);
    });

    it("returns empty object on API error", async () => {
      mockFetch.mockReturnValueOnce(fail({ error: {} }, 500));
      const insights = await adapter.getInsights("p1", TOKEN);
      expect(insights).toEqual({});
    });
  });
});
