jest.mock("@prisma/client", () => ({
  MediaType: {
    NONE: "NONE",
    IMAGE: "IMAGE",
    VIDEO: "VIDEO",
    CAROUSEL: "CAROUSEL",
  },
}));

import { YouTubeAdapter } from "../platforms/youtube";
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
    headers: new Headers({ "content-type": "video/mp4" }),
    json: () => Promise.resolve(data),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  });
}

function noContent(status = 204) {
  return Promise.resolve({
    ok: true,
    status,
    statusText: "No Content",
    json: () => Promise.resolve({}),
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

const CHANNEL_ID = "UC_test_channel_id";
const TOKEN = "test_youtube_token";
const VIDEO_ID = "dQw4w9WgXcQ";

describe("YouTubeAdapter", () => {
  let adapter: YouTubeAdapter;

  beforeEach(() => {
    adapter = new YouTubeAdapter();
  });

  // ── publish – VIDEO ────────────────────────────────────────────────────────

  describe("publish – VIDEO", () => {
    it("fetches video bytes, uploads via multipart, and returns platformPostId + publishedUrl", async () => {
      // Call 1: fetch video bytes from public URL
      mockFetch.mockReturnValueOnce(ok(null));
      // Call 2: upload to YouTube
      mockFetch.mockReturnValueOnce(ok({ id: VIDEO_ID, status: { uploadStatus: "uploaded" } }));

      const result = await adapter.publish(
        {
          content: "My awesome video\nThis is the description",
          mediaType: MediaType.VIDEO,
          mediaUrls: ["https://example.com/video.mp4"],
        },
        CHANNEL_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe(VIDEO_ID);
      expect(result.publishedUrl).toBe(
        `https://www.youtube.com/watch?v=${VIDEO_ID}`
      );
      expect(result.publishedAt).toBeInstanceOf(Date);

      // Verify upload call headers
      const [uploadUrl, uploadOptions] = mockFetch.mock.calls[1] as [
        string,
        RequestInit,
      ];
      expect(uploadUrl).toContain("upload/youtube/v3/videos");
      expect(uploadUrl).toContain("uploadType=multipart");
      expect(
        (uploadOptions.headers as Record<string, string>)["Authorization"]
      ).toBe(`Bearer ${TOKEN}`);
    });

    it("uses first line as title and rest as description", async () => {
      mockFetch.mockReturnValueOnce(ok(null));
      mockFetch.mockReturnValueOnce(ok({ id: VIDEO_ID }));

      await adapter.publish(
        {
          content: "Great Title\nLine 2\nLine 3",
          mediaType: MediaType.VIDEO,
          mediaUrls: ["https://example.com/vid.mp4"],
        },
        CHANNEL_ID,
        TOKEN
      );

      const [, uploadOptions] = mockFetch.mock.calls[1] as [string, RequestInit];
      const bodyStr = new TextDecoder().decode(
        uploadOptions.body as Uint8Array
      );
      expect(bodyStr).toContain('"Great Title"');
    });
  });

  // ── publish – unsupported types ────────────────────────────────────────────

  describe("publish – unsupported media types", () => {
    it("throws for NONE", async () => {
      await expect(
        adapter.publish(
          { content: "text", mediaType: MediaType.NONE, mediaUrls: [] },
          CHANNEL_ID,
          TOKEN
        )
      ).rejects.toThrow("YouTube adapter only supports VIDEO posts");
    });

    it("throws for IMAGE", async () => {
      await expect(
        adapter.publish(
          {
            content: "image",
            mediaType: MediaType.IMAGE,
            mediaUrls: ["https://example.com/img.jpg"],
          },
          CHANNEL_ID,
          TOKEN
        )
      ).rejects.toThrow("YouTube adapter only supports VIDEO posts");
    });

    it("throws for CAROUSEL", async () => {
      await expect(
        adapter.publish(
          {
            content: "carousel",
            mediaType: MediaType.CAROUSEL,
            mediaUrls: ["https://example.com/img.jpg"],
          },
          CHANNEL_ID,
          TOKEN
        )
      ).rejects.toThrow("YouTube adapter only supports VIDEO posts");
    });

    it("throws when VIDEO has no mediaUrls", async () => {
      await expect(
        adapter.publish(
          { content: "video", mediaType: MediaType.VIDEO, mediaUrls: [] },
          CHANNEL_ID,
          TOKEN
        )
      ).rejects.toThrow("VIDEO post requires at least one media URL");
    });
  });

  // ── getStatus ──────────────────────────────────────────────────────────────

  describe("getStatus", () => {
    it("returns PUBLISHED when uploadStatus is processed", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ items: [{ id: VIDEO_ID, status: { uploadStatus: "processed" } }] })
      );

      const status = await adapter.getStatus(VIDEO_ID, TOKEN);
      expect(status.status).toBe("PUBLISHED");
    });

    it("returns PUBLISHED when uploadStatus is uploaded", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ items: [{ id: VIDEO_ID, status: { uploadStatus: "uploaded" } }] })
      );

      const status = await adapter.getStatus(VIDEO_ID, TOKEN);
      expect(status.status).toBe("PUBLISHED");
    });

    it("returns PROCESSING when uploadStatus is in progress", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ items: [{ id: VIDEO_ID, status: { uploadStatus: "processing" } }] })
      );

      const status = await adapter.getStatus(VIDEO_ID, TOKEN);
      expect(status.status).toBe("PROCESSING");
    });

    it("returns FAILED when uploadStatus is failed", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ items: [{ id: VIDEO_ID, status: { uploadStatus: "failed" } }] })
      );

      const status = await adapter.getStatus(VIDEO_ID, TOKEN);
      expect(status.status).toBe("FAILED");
    });

    it("returns FAILED when video not found (empty items)", async () => {
      mockFetch.mockReturnValueOnce(ok({ items: [] }));

      const status = await adapter.getStatus(VIDEO_ID, TOKEN);
      expect(status.status).toBe("FAILED");
      expect(status.error).toContain("not found");
    });

    it("returns FAILED on HTTP error", async () => {
      mockFetch.mockReturnValueOnce(fail({ error: { message: "forbidden" } }, 403));

      const status = await adapter.getStatus(VIDEO_ID, TOKEN);
      expect(status.status).toBe("FAILED");
    });
  });

  // ── deletePost ─────────────────────────────────────────────────────────────

  describe("deletePost", () => {
    it("calls DELETE and resolves on 204", async () => {
      mockFetch.mockReturnValueOnce(noContent(204));

      await expect(adapter.deletePost(VIDEO_ID, TOKEN)).resolves.toBeUndefined();

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(VIDEO_ID);
      expect(options.method).toBe("DELETE");
    });

    it("resolves on 404 (already deleted)", async () => {
      mockFetch.mockReturnValueOnce(
        Promise.resolve({
          ok: false,
          status: 404,
          statusText: "Not Found",
          json: () => Promise.resolve({ error: { message: "not found" } }),
        })
      );

      await expect(adapter.deletePost(VIDEO_ID, TOKEN)).resolves.toBeUndefined();
    });

    it("throws on other HTTP errors", async () => {
      mockFetch.mockReturnValueOnce(
        Promise.resolve({
          ok: false,
          status: 403,
          statusText: "Forbidden",
          json: () =>
            Promise.resolve({ error: { message: "insufficient permissions" } }),
        })
      );

      await expect(adapter.deletePost(VIDEO_ID, TOKEN)).rejects.toThrow(
        "YouTube delete error (403)"
      );
    });
  });

  // ── getInsights ────────────────────────────────────────────────────────────

  describe("getInsights", () => {
    it("returns empty object when no items", async () => {
      mockFetch.mockReturnValueOnce(ok({ items: [] }));

      const insights = await adapter.getInsights(VIDEO_ID, TOKEN);
      expect(insights).toEqual({});
    });

    it("maps viewCount to impressions and parses likeCount, commentCount", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          items: [
            {
              statistics: {
                viewCount: "12345",
                likeCount: "987",
                commentCount: "42",
              },
            },
          ],
        })
      );

      const insights = await adapter.getInsights(VIDEO_ID, TOKEN);
      expect(insights.impressions).toBe(12345);
      expect(insights.likes).toBe(987);
      expect(insights.comments).toBe(42);
    });

    it("returns empty object on HTTP error", async () => {
      mockFetch.mockReturnValueOnce(fail({}, 500));

      const insights = await adapter.getInsights(VIDEO_ID, TOKEN);
      expect(insights).toEqual({});
    });

    it("returns empty object when statistics absent", async () => {
      mockFetch.mockReturnValueOnce(ok({ items: [{ id: VIDEO_ID }] }));

      const insights = await adapter.getInsights(VIDEO_ID, TOKEN);
      expect(insights).toEqual({});
    });
  });
});
