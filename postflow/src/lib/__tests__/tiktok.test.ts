jest.mock("@prisma/client", () => ({
  MediaType: {
    NONE: "NONE",
    IMAGE: "IMAGE",
    VIDEO: "VIDEO",
    CAROUSEL: "CAROUSEL",
  },
}));

import { TikTokAdapter } from "../platforms/tiktok";
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

const OPEN_ID = "tiktok_open_id_123";
const TOKEN = "test_tiktok_access_token";
const PUBLISH_ID = "v_pub_url~v1-abcdef123456";
const VIDEO_ID = "7123456789012345678";

describe("TikTokAdapter", () => {
  let adapter: TikTokAdapter;

  beforeEach(() => {
    adapter = new TikTokAdapter();
  });

  // ── publish – VIDEO ────────────────────────────────────────────────────────

  describe("publish – VIDEO", () => {
    it("calls publish/video/init and returns publish_id as platformPostId", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ data: { publish_id: PUBLISH_ID }, error: { code: "ok" } })
      );

      const result = await adapter.publish(
        {
          content: "My TikTok video caption",
          mediaType: MediaType.VIDEO,
          mediaUrls: ["https://cdn.example.com/video.mp4"],
        },
        OPEN_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe(PUBLISH_ID);
      expect(result.publishedAt).toBeInstanceOf(Date);

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/post/publish/video/init/");
      expect((options.headers as Record<string, string>)["Authorization"]).toBe(
        `Bearer ${TOKEN}`
      );

      const body = JSON.parse(options.body as string) as {
        post_info: { title: string };
        source_info: { source: string; video_url: string };
      };
      expect(body.source_info.source).toBe("PULL_FROM_URL");
      expect(body.source_info.video_url).toBe(
        "https://cdn.example.com/video.mp4"
      );
    });

    it("trims caption to 2200 chars", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ data: { publish_id: PUBLISH_ID }, error: { code: "ok" } })
      );

      const longCaption = "a".repeat(3000);
      await adapter.publish(
        {
          content: longCaption,
          mediaType: MediaType.VIDEO,
          mediaUrls: ["https://cdn.example.com/video.mp4"],
        },
        OPEN_ID,
        TOKEN
      );

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as {
        post_info: { title: string };
      };
      expect(body.post_info.title.length).toBe(2200);
    });

    it("throws when VIDEO has no mediaUrls", async () => {
      await expect(
        adapter.publish(
          { content: "video", mediaType: MediaType.VIDEO, mediaUrls: [] },
          OPEN_ID,
          TOKEN
        )
      ).rejects.toThrow("VIDEO post requires at least one media URL");
    });
  });

  // ── publish – unsupported types ────────────────────────────────────────────

  describe("publish – unsupported media types", () => {
    it("throws for NONE", async () => {
      await expect(
        adapter.publish(
          { content: "text only", mediaType: MediaType.NONE, mediaUrls: [] },
          OPEN_ID,
          TOKEN
        )
      ).rejects.toThrow("TikTok adapter only supports VIDEO posts");
    });

    it("throws for IMAGE", async () => {
      await expect(
        adapter.publish(
          {
            content: "image",
            mediaType: MediaType.IMAGE,
            mediaUrls: ["https://example.com/img.jpg"],
          },
          OPEN_ID,
          TOKEN
        )
      ).rejects.toThrow("TikTok adapter only supports VIDEO posts");
    });

    it("throws for CAROUSEL", async () => {
      await expect(
        adapter.publish(
          {
            content: "carousel",
            mediaType: MediaType.CAROUSEL,
            mediaUrls: ["https://example.com/img.jpg"],
          },
          OPEN_ID,
          TOKEN
        )
      ).rejects.toThrow("TikTok adapter only supports VIDEO posts");
    });
  });

  // ── getStatus ──────────────────────────────────────────────────────────────

  describe("getStatus", () => {
    it("returns PUBLISHED when status is PUBLISHED", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          data: {
            status: "PUBLISHED",
            publicaly_available_post_id: [VIDEO_ID],
          },
        })
      );

      const status = await adapter.getStatus(PUBLISH_ID, TOKEN);
      expect(status.status).toBe("PUBLISHED");
      expect(status.platformPostId).toBe(VIDEO_ID);
    });

    it("returns FAILED when status is FAILED", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          data: {
            status: "FAILED",
            fail_reason: "Video upload timeout",
          },
        })
      );

      const status = await adapter.getStatus(PUBLISH_ID, TOKEN);
      expect(status.status).toBe("FAILED");
      expect(status.error).toBe("Video upload timeout");
    });

    it("returns PROCESSING when status is in progress", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          data: { status: "PROCESSING_UPLOAD" },
        })
      );

      const status = await adapter.getStatus(PUBLISH_ID, TOKEN);
      expect(status.status).toBe("PROCESSING");
    });

    it("returns FAILED on HTTP error", async () => {
      mockFetch.mockReturnValueOnce(fail({}, 403));

      const status = await adapter.getStatus(PUBLISH_ID, TOKEN);
      expect(status.status).toBe("FAILED");
      expect(status.error).toContain("403");
    });
  });

  // ── deletePost ─────────────────────────────────────────────────────────────

  describe("deletePost", () => {
    it("calls POST /video/delete/ and resolves on 200", async () => {
      mockFetch.mockReturnValueOnce(ok({ data: {} }));

      await expect(
        adapter.deletePost(VIDEO_ID, TOKEN)
      ).resolves.toBeUndefined();

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/video/delete/");
      expect(options.method).toBe("POST");
    });

    it("resolves on 404 (already deleted)", async () => {
      mockFetch.mockReturnValueOnce(
        Promise.resolve({
          ok: false,
          status: 404,
          statusText: "Not Found",
          json: () => Promise.resolve({}),
        })
      );

      await expect(
        adapter.deletePost(VIDEO_ID, TOKEN)
      ).resolves.toBeUndefined();
    });

    it("throws on other HTTP errors", async () => {
      mockFetch.mockReturnValueOnce(
        Promise.resolve({
          ok: false,
          status: 403,
          statusText: "Forbidden",
          json: () =>
            Promise.resolve({
              error: { message: "insufficient permissions" },
            }),
        })
      );

      await expect(adapter.deletePost(VIDEO_ID, TOKEN)).rejects.toThrow(
        "TikTok delete error (403)"
      );
    });
  });

  // ── getInsights ────────────────────────────────────────────────────────────

  describe("getInsights", () => {
    it("returns empty object when no video data returned", async () => {
      mockFetch.mockReturnValueOnce(ok({ data: { videos: [] } }));

      const insights = await adapter.getInsights(VIDEO_ID, TOKEN);
      expect(insights).toEqual({});
    });

    it("maps view_count to impressions, like_count, comment_count, share_count", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          data: {
            videos: [
              {
                id: VIDEO_ID,
                view_count: 50000,
                like_count: 3200,
                comment_count: 145,
                share_count: 89,
              },
            ],
          },
        })
      );

      const insights = await adapter.getInsights(VIDEO_ID, TOKEN);
      expect(insights.impressions).toBe(50000);
      expect(insights.likes).toBe(3200);
      expect(insights.comments).toBe(145);
      expect(insights.shares).toBe(89);
    });

    it("returns empty object on HTTP error", async () => {
      mockFetch.mockReturnValueOnce(fail({}, 500));

      const insights = await adapter.getInsights(VIDEO_ID, TOKEN);
      expect(insights).toEqual({});
    });
  });
});
