jest.mock("@prisma/client", () => ({
  MediaType: {
    NONE: "NONE",
    IMAGE: "IMAGE",
    VIDEO: "VIDEO",
    CAROUSEL: "CAROUSEL",
  },
}));

jest.mock("../auth/tumblr-oauth", () => ({
  parseTumblrToken: (raw: string) => JSON.parse(raw),
}));

import { TumblrAdapter } from "../platforms/tumblr";
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
    headers: new Headers({ "content-type": "application/json" }),
  });
}

function fail(data: unknown, status = 400) {
  return Promise.resolve({
    ok: false,
    status,
    statusText: "Error",
    json: () => Promise.resolve(data),
    headers: new Headers(),
  });
}

const ACCOUNT_ID = "myblog";
const TOKEN = JSON.stringify({
  accessToken: "tumblr_access_token",
  refreshToken: "tumblr_refresh_token",
  username: "testuser",
  primaryBlog: "myblog",
  blogs: [{ name: "myblog", url: "https://myblog.tumblr.com", isPrimary: true }],
});
const POST_ID = "123456789";

describe("TumblrAdapter", () => {
  let adapter: TumblrAdapter;

  beforeEach(() => {
    adapter = new TumblrAdapter();
  });

  // ── publish – NONE (text post) ─────────────────────────────────────────────

  describe("publish – NONE (text post)", () => {
    it("creates a text post and returns platformPostId + publishedUrl", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          meta: { status: 201, msg: "Created" },
          response: {
            id_string: POST_ID,
            post_url: `https://myblog.tumblr.com/post/${POST_ID}`,
          },
        })
      );

      const result = await adapter.publish(
        {
          content: "Hello Tumblr world!",
          mediaType: MediaType.NONE,
          mediaUrls: [],
        },
        ACCOUNT_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe(POST_ID);
      expect(result.publishedUrl).toContain("tumblr.com");
      expect(result.publishedAt).toBeInstanceOf(Date);

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/blog/myblog/posts");
      expect(options.method).toBe("POST");
      expect(
        (options.headers as Record<string, string>)["Authorization"]
      ).toBe("Bearer tumblr_access_token");

      const body = JSON.parse(options.body as string) as {
        content: Array<{ type: string; text?: string }>;
      };
      expect(body.content).toHaveLength(1);
      expect(body.content[0]).toMatchObject({ type: "text", text: "Hello Tumblr world!" });
    });

    it("truncates content to 4096 chars", async () => {
      const longContent = "A".repeat(5000);

      mockFetch.mockReturnValueOnce(
        ok({
          meta: { status: 201, msg: "Created" },
          response: { id_string: POST_ID },
        })
      );

      await adapter.publish(
        { content: longContent, mediaType: MediaType.NONE, mediaUrls: [] },
        ACCOUNT_ID,
        TOKEN
      );

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as {
        content: Array<{ type: string; text?: string }>;
      };
      const textBlock = body.content.find((b) => b.type === "text");
      expect(textBlock?.text?.length).toBe(4096);
    });

    it("falls back to constructed URL when post_url is missing", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          meta: { status: 201, msg: "Created" },
          response: { id_string: POST_ID },
        })
      );

      const result = await adapter.publish(
        { content: "test", mediaType: MediaType.NONE, mediaUrls: [] },
        ACCOUNT_ID,
        TOKEN
      );

      expect(result.publishedUrl).toContain(POST_ID);
    });

    it("throws on Tumblr API error", async () => {
      mockFetch.mockReturnValueOnce(
        fail(
          {
            meta: { status: 401, msg: "Unauthorized" },
            errors: [{ title: "Unauthorized", detail: "Invalid access token" }],
          },
          401
        )
      );

      await expect(
        adapter.publish(
          { content: "test", mediaType: MediaType.NONE, mediaUrls: [] },
          ACCOUNT_ID,
          TOKEN
        )
      ).rejects.toThrow("Tumblr API error (401)");
    });
  });

  // ── publish – IMAGE (photo post) ───────────────────────────────────────────

  describe("publish – IMAGE (photo post)", () => {
    it("creates an image post with NPF image blocks", async () => {
      const imageUrl = "https://cdn.example.com/photo.jpg";

      mockFetch.mockReturnValueOnce(
        ok({
          meta: { status: 201, msg: "Created" },
          response: {
            id_string: POST_ID,
            post_url: `https://myblog.tumblr.com/post/${POST_ID}`,
          },
        })
      );

      const result = await adapter.publish(
        {
          content: "Check out this photo!",
          mediaType: MediaType.IMAGE,
          mediaUrls: [imageUrl],
        },
        ACCOUNT_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe(POST_ID);

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as {
        content: Array<{
          type: string;
          media?: Array<{ url: string }>;
          text?: string;
        }>;
      };

      const imageBlock = body.content.find((b) => b.type === "image");
      expect(imageBlock).toBeDefined();
      expect(imageBlock?.media?.[0]?.url).toBe(imageUrl);

      const textBlock = body.content.find((b) => b.type === "text");
      expect(textBlock).toBeDefined();
    });

    it("includes multiple image blocks for multiple URLs", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          meta: { status: 201, msg: "Created" },
          response: { id_string: POST_ID },
        })
      );

      await adapter.publish(
        {
          content: "Photos",
          mediaType: MediaType.IMAGE,
          mediaUrls: [
            "https://cdn.example.com/1.jpg",
            "https://cdn.example.com/2.jpg",
          ],
        },
        ACCOUNT_ID,
        TOKEN
      );

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as {
        content: Array<{ type: string }>;
      };
      const imageBlocks = body.content.filter((b) => b.type === "image");
      expect(imageBlocks).toHaveLength(2);
    });
  });

  // ── publish – unsupported types ────────────────────────────────────────────

  describe("publish – unsupported media types", () => {
    it("throws for VIDEO", async () => {
      await expect(
        adapter.publish(
          {
            content: "video post",
            mediaType: MediaType.VIDEO,
            mediaUrls: ["https://example.com/video.mp4"],
          },
          ACCOUNT_ID,
          TOKEN
        )
      ).rejects.toThrow("Tumblr adapter does not support VIDEO posts");
    });

    it("throws for CAROUSEL", async () => {
      await expect(
        adapter.publish(
          {
            content: "carousel post",
            mediaType: MediaType.CAROUSEL,
            mediaUrls: [],
          },
          ACCOUNT_ID,
          TOKEN
        )
      ).rejects.toThrow("Tumblr adapter does not support CAROUSEL posts");
    });
  });

  // ── getStatus ──────────────────────────────────────────────────────────────

  describe("getStatus", () => {
    it("returns PUBLISHED when post state is 'published'", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          meta: { status: 200, msg: "OK" },
          response: { id_string: POST_ID, state: "published" },
        })
      );

      const status = await adapter.getStatus(POST_ID, TOKEN);
      expect(status.status).toBe("PUBLISHED");
    });

    it("returns PENDING when post state is 'queued'", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          meta: { status: 200, msg: "OK" },
          response: { id_string: POST_ID, state: "queued" },
        })
      );

      const status = await adapter.getStatus(POST_ID, TOKEN);
      expect(status.status).toBe("PENDING");
    });

    it("returns PENDING when post state is 'draft'", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          meta: { status: 200, msg: "OK" },
          response: { id_string: POST_ID, state: "draft" },
        })
      );

      const status = await adapter.getStatus(POST_ID, TOKEN);
      expect(status.status).toBe("PENDING");
    });

    it("returns FAILED when response is missing", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          meta: { status: 200, msg: "OK" },
          response: undefined,
        })
      );

      const status = await adapter.getStatus(POST_ID, TOKEN);
      expect(status.status).toBe("FAILED");
    });

    it("returns FAILED on API error", async () => {
      mockFetch.mockReturnValueOnce(
        fail({ meta: { status: 404, msg: "Not Found" }, errors: [{ title: "Not Found" }] }, 404)
      );

      const status = await adapter.getStatus(POST_ID, TOKEN);
      expect(status.status).toBe("FAILED");
    });
  });

  // ── deletePost ─────────────────────────────────────────────────────────────

  describe("deletePost", () => {
    it("sends POST to /post/delete and resolves on 200", async () => {
      mockFetch.mockReturnValueOnce(
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          json: () => Promise.resolve({ meta: { status: 200, msg: "OK" }, response: {} }),
        })
      );

      await expect(adapter.deletePost(POST_ID, TOKEN)).resolves.toBeUndefined();

      const [url] = mockFetch.mock.calls[0] as [string];
      expect(url).toContain("/post/delete");
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

      await expect(adapter.deletePost(POST_ID, TOKEN)).resolves.toBeUndefined();
    });

    it("throws on other HTTP errors", async () => {
      mockFetch.mockReturnValueOnce(
        Promise.resolve({
          ok: false,
          status: 403,
          statusText: "Forbidden",
          json: () => Promise.resolve({}),
        })
      );

      await expect(adapter.deletePost(POST_ID, TOKEN)).rejects.toThrow(
        "Tumblr delete error (403)"
      );
    });
  });

  // ── getInsights ────────────────────────────────────────────────────────────

  describe("getInsights", () => {
    it("returns note_count as likes", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          meta: { status: 200, msg: "OK" },
          response: { id_string: POST_ID, state: "published", note_count: 42 },
        })
      );

      const insights = await adapter.getInsights(POST_ID, TOKEN);
      expect(insights.likes).toBe(42);
    });

    it("returns empty object when response is missing", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ meta: { status: 200, msg: "OK" }, response: undefined })
      );

      const insights = await adapter.getInsights(POST_ID, TOKEN);
      expect(insights).toEqual({});
    });

    it("returns empty object on HTTP error", async () => {
      mockFetch.mockReturnValueOnce(
        fail({ meta: { status: 500, msg: "Server Error" } }, 500)
      );

      const insights = await adapter.getInsights(POST_ID, TOKEN);
      expect(insights).toEqual({});
    });
  });
});
