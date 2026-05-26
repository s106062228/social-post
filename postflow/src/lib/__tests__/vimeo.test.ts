jest.mock("@prisma/client", () => ({
  MediaType: {
    NONE: "NONE",
    IMAGE: "IMAGE",
    VIDEO: "VIDEO",
    CAROUSEL: "CAROUSEL",
  },
}));

import { VimeoAdapter } from "../platforms/vimeo";
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
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve(data),
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

const ACCOUNT_ID = "test-account-id";
const TOKEN = "vimeo-test-token";
const VIDEO_ID = "12345678";

describe("VimeoAdapter", () => {
  let adapter: VimeoAdapter;

  beforeEach(() => {
    adapter = new VimeoAdapter();
  });

  // ── publish – VIDEO ────────────────────────────────────────────────────────

  describe("publish – VIDEO", () => {
    it("uses pull upload approach and returns platformPostId + publishedUrl", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          uri: `/videos/${VIDEO_ID}`,
          link: `https://vimeo.com/${VIDEO_ID}`,
          upload: { status: "complete" },
        })
      );

      const result = await adapter.publish(
        {
          content: "My Awesome Video\nThis is the description",
          mediaType: MediaType.VIDEO,
          mediaUrls: ["https://example.com/video.mp4"],
        },
        ACCOUNT_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe(VIDEO_ID);
      expect(result.publishedUrl).toBe(`https://vimeo.com/${VIDEO_ID}`);
      expect(result.publishedAt).toBeInstanceOf(Date);

      // Verify the request body uses pull approach
      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.vimeo.com/me/videos");
      expect(options.method).toBe("POST");
      const body = JSON.parse(options.body as string) as {
        name: string;
        upload: { approach: string; link: string };
      };
      expect(body.upload.approach).toBe("pull");
      expect(body.upload.link).toBe("https://example.com/video.mp4");
    });

    it("uses first line as title and rest as description", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          uri: `/videos/${VIDEO_ID}`,
          link: `https://vimeo.com/${VIDEO_ID}`,
        })
      );

      await adapter.publish(
        {
          content: "Great Title\nLine 2\nLine 3",
          mediaType: MediaType.VIDEO,
          mediaUrls: ["https://example.com/vid.mp4"],
        },
        ACCOUNT_ID,
        TOKEN
      );

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as {
        name: string;
        description: string;
      };
      expect(body.name).toBe("Great Title");
      expect(body.description).toContain("Line 2");
    });

    it("falls back to vimeo.com URL when link is absent", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          uri: `/videos/${VIDEO_ID}`,
          // no link property
        })
      );

      const result = await adapter.publish(
        {
          content: "Video without link",
          mediaType: MediaType.VIDEO,
          mediaUrls: ["https://example.com/video.mp4"],
        },
        ACCOUNT_ID,
        TOKEN
      );

      expect(result.publishedUrl).toBe(`https://vimeo.com/${VIDEO_ID}`);
    });
  });

  // ── publish – unsupported types ────────────────────────────────────────────

  describe("publish – unsupported media types", () => {
    it("throws for NONE", async () => {
      await expect(
        adapter.publish(
          { content: "text only", mediaType: MediaType.NONE, mediaUrls: [] },
          ACCOUNT_ID,
          TOKEN
        )
      ).rejects.toThrow("Vimeo adapter only supports VIDEO posts");
    });

    it("throws for IMAGE", async () => {
      await expect(
        adapter.publish(
          {
            content: "image post",
            mediaType: MediaType.IMAGE,
            mediaUrls: ["https://example.com/img.jpg"],
          },
          ACCOUNT_ID,
          TOKEN
        )
      ).rejects.toThrow("Vimeo adapter only supports VIDEO posts");
    });

    it("throws for CAROUSEL", async () => {
      await expect(
        adapter.publish(
          {
            content: "carousel post",
            mediaType: MediaType.CAROUSEL,
            mediaUrls: ["https://example.com/img.jpg"],
          },
          ACCOUNT_ID,
          TOKEN
        )
      ).rejects.toThrow("Vimeo adapter only supports VIDEO posts");
    });

    it("throws when VIDEO has no mediaUrls", async () => {
      await expect(
        adapter.publish(
          { content: "video", mediaType: MediaType.VIDEO, mediaUrls: [] },
          ACCOUNT_ID,
          TOKEN
        )
      ).rejects.toThrow("VIDEO post requires at least one media URL");
    });
  });

  // ── getStatus ──────────────────────────────────────────────────────────────

  describe("getStatus", () => {
    it("returns PUBLISHED when status is available", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ uri: `/videos/${VIDEO_ID}`, status: "available" })
      );

      const result = await adapter.getStatus(VIDEO_ID, TOKEN);
      expect(result.status).toBe("PUBLISHED");
    });

    it("returns PROCESSING when status is transcoding", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ uri: `/videos/${VIDEO_ID}`, status: "transcoding" })
      );

      const result = await adapter.getStatus(VIDEO_ID, TOKEN);
      expect(result.status).toBe("PROCESSING");
    });

    it("returns PROCESSING when status is uploading", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ uri: `/videos/${VIDEO_ID}`, status: "uploading" })
      );

      const result = await adapter.getStatus(VIDEO_ID, TOKEN);
      expect(result.status).toBe("PROCESSING");
    });

    it("returns FAILED when status is upload_error", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ uri: `/videos/${VIDEO_ID}`, status: "upload_error" })
      );

      const result = await adapter.getStatus(VIDEO_ID, TOKEN);
      expect(result.status).toBe("FAILED");
    });

    it("returns FAILED on HTTP error", async () => {
      mockFetch.mockReturnValueOnce(
        fail({ error: "Forbidden" }, 403)
      );

      const result = await adapter.getStatus(VIDEO_ID, TOKEN);
      expect(result.status).toBe("FAILED");
      expect(result.error).toContain("403");
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
          json: () => Promise.resolve({ error: "not found" }),
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
            Promise.resolve({ error: "Insufficient permissions" }),
        })
      );

      await expect(adapter.deletePost(VIDEO_ID, TOKEN)).rejects.toThrow(
        "Vimeo delete error (403)"
      );
    });
  });

  // ── getInsights ────────────────────────────────────────────────────────────

  describe("getInsights", () => {
    it("returns empty object when fetch fails", async () => {
      mockFetch.mockReturnValueOnce(fail({}, 500));

      const insights = await adapter.getInsights(VIDEO_ID, TOKEN);
      expect(insights).toEqual({});
    });

    it("maps stats.plays to impressions", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          uri: `/videos/${VIDEO_ID}`,
          stats: { plays: 1234 },
          metadata: {
            connections: {
              likes: { total: 56 },
              comments: { total: 7 },
            },
          },
        })
      );

      const insights = await adapter.getInsights(VIDEO_ID, TOKEN);
      expect(insights.impressions).toBe(1234);
      expect(insights.likes).toBe(56);
      expect(insights.comments).toBe(7);
    });

    it("returns empty object when stats is absent", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ uri: `/videos/${VIDEO_ID}` })
      );

      const insights = await adapter.getInsights(VIDEO_ID, TOKEN);
      expect(insights).toEqual({});
    });

    it("handles missing metadata gracefully", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          uri: `/videos/${VIDEO_ID}`,
          stats: { plays: 100 },
        })
      );

      const insights = await adapter.getInsights(VIDEO_ID, TOKEN);
      expect(insights.impressions).toBe(100);
      expect(insights.likes).toBeUndefined();
      expect(insights.comments).toBeUndefined();
    });
  });
});
