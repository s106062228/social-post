jest.mock("@prisma/client", () => ({
  MediaType: {
    NONE: "NONE",
    IMAGE: "IMAGE",
    VIDEO: "VIDEO",
    CAROUSEL: "CAROUSEL",
  },
}));

jest.mock("../auth/wordpress-oauth", () => ({
  parseWordPressToken: (raw: string) => JSON.parse(raw),
}));

import { WordPressAdapter } from "../platforms/wordpress";
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
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
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

function imageOk(buffer: ArrayBuffer, contentType = "image/jpeg") {
  return Promise.resolve({
    ok: true,
    status: 200,
    statusText: "OK",
    json: () => Promise.resolve({}),
    headers: new Headers({ "content-type": contentType }),
    arrayBuffer: () => Promise.resolve(buffer),
  });
}

const ACCOUNT_ID = "12345678";
const TOKEN = JSON.stringify({
  accessToken: "wp_access_token",
  siteId: "12345678",
  siteUrl: "https://myblog.wordpress.com",
  blogName: "My Blog",
});
const POST_ID = "99";

describe("WordPressAdapter", () => {
  let adapter: WordPressAdapter;

  beforeEach(() => {
    adapter = new WordPressAdapter();
  });

  // ── publish – NONE (text post) ─────────────────────────────────────────────

  describe("publish – NONE (text post)", () => {
    it("creates a text post and returns platformPostId + publishedUrl", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          ID: Number(POST_ID),
          URL: `https://myblog.wordpress.com/?p=${POST_ID}`,
          status: "publish",
        })
      );

      const result = await adapter.publish(
        {
          content: "Hello WordPress world!\nThis is the body.",
          mediaType: MediaType.NONE,
          mediaUrls: [],
        },
        ACCOUNT_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe(POST_ID);
      expect(result.publishedUrl).toContain("wordpress.com");
      expect(result.publishedAt).toBeInstanceOf(Date);

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(`/sites/${ACCOUNT_ID}/posts/new`);
      expect(options.method).toBe("POST");
      expect(
        (options.headers as Record<string, string>)["Authorization"]
      ).toBe("Bearer wp_access_token");

      const body = JSON.parse(options.body as string) as {
        title: string;
        content: string;
        status: string;
      };
      expect(body.title).toBe("Hello WordPress world!");
      expect(body.status).toBe("publish");
    });

    it("uses full content as body when no newline in content", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ ID: Number(POST_ID), URL: "https://myblog.wordpress.com/?p=99", status: "publish" })
      );

      await adapter.publish(
        { content: "Short post", mediaType: MediaType.NONE, mediaUrls: [] },
        ACCOUNT_ID,
        TOKEN
      );

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as {
        title: string;
        content: string;
      };
      expect(body.title).toBe("Short post");
      // content falls back to original when no body after title
      expect(body.content).toBe("Short post");
    });

    it("throws on WordPress API error", async () => {
      mockFetch.mockReturnValueOnce(
        fail({ error: "unauthorized", message: "Access token missing" }, 401)
      );

      await expect(
        adapter.publish(
          { content: "test", mediaType: MediaType.NONE, mediaUrls: [] },
          ACCOUNT_ID,
          TOKEN
        )
      ).rejects.toThrow("WordPress API error (401)");
    });
  });

  // ── publish – IMAGE (with featured image) ─────────────────────────────────

  describe("publish – IMAGE", () => {
    it("uploads media and sets featured_image on the post", async () => {
      const imageBuffer = new ArrayBuffer(8);
      const imageUrl = "https://cdn.example.com/photo.jpg";

      // 1st fetch: download image bytes
      mockFetch.mockReturnValueOnce(imageOk(imageBuffer));
      // 2nd fetch: upload media to WordPress
      mockFetch.mockReturnValueOnce(
        ok({ media: [{ ID: 42, URL: "https://files.wordpress.com/photo.jpg" }] })
      );
      // 3rd fetch: create post
      mockFetch.mockReturnValueOnce(
        ok({
          ID: Number(POST_ID),
          URL: `https://myblog.wordpress.com/?p=${POST_ID}`,
          status: "publish",
        })
      );

      const result = await adapter.publish(
        {
          content: "Look at this photo!",
          mediaType: MediaType.IMAGE,
          mediaUrls: [imageUrl],
        },
        ACCOUNT_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe(POST_ID);

      // Check post creation call sets featured_image
      const [, postOptions] = mockFetch.mock.calls[2] as [string, RequestInit];
      const body = JSON.parse(postOptions.body as string) as {
        featured_image: string;
      };
      expect(body.featured_image).toBe("42");
    });

    it("throws when image fetch fails", async () => {
      mockFetch.mockReturnValueOnce(
        Promise.resolve({
          ok: false,
          status: 404,
          statusText: "Not Found",
          headers: new Headers(),
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        })
      );

      await expect(
        adapter.publish(
          {
            content: "photo",
            mediaType: MediaType.IMAGE,
            mediaUrls: ["https://cdn.example.com/missing.jpg"],
          },
          ACCOUNT_ID,
          TOKEN
        )
      ).rejects.toThrow("Failed to fetch image");
    });

    it("throws when media upload fails", async () => {
      const imageBuffer = new ArrayBuffer(8);
      mockFetch.mockReturnValueOnce(imageOk(imageBuffer));
      mockFetch.mockReturnValueOnce(
        Promise.resolve({
          ok: false,
          status: 422,
          statusText: "Unprocessable Entity",
          json: () => Promise.resolve({ message: "Invalid file type" }),
          headers: new Headers(),
        })
      );

      await expect(
        adapter.publish(
          {
            content: "photo",
            mediaType: MediaType.IMAGE,
            mediaUrls: ["https://cdn.example.com/photo.jpg"],
          },
          ACCOUNT_ID,
          TOKEN
        )
      ).rejects.toThrow("WordPress media upload error");
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
      ).rejects.toThrow("WordPress adapter does not support VIDEO posts");
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
      ).rejects.toThrow("WordPress adapter does not support CAROUSEL posts");
    });
  });

  // ── getStatus ──────────────────────────────────────────────────────────────

  describe("getStatus", () => {
    it("returns PUBLISHED when post status is 'publish'", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ ID: Number(POST_ID), URL: "https://myblog.wordpress.com/?p=99", status: "publish" })
      );

      const status = await adapter.getStatus(POST_ID, TOKEN);
      expect(status.status).toBe("PUBLISHED");
    });

    it("returns PENDING when post status is 'draft'", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ ID: Number(POST_ID), status: "draft" })
      );

      const status = await adapter.getStatus(POST_ID, TOKEN);
      expect(status.status).toBe("PENDING");
    });

    it("returns PENDING when post status is 'pending'", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ ID: Number(POST_ID), status: "pending" })
      );

      const status = await adapter.getStatus(POST_ID, TOKEN);
      expect(status.status).toBe("PENDING");
    });

    it("returns FAILED when post ID is missing", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ status: "publish" })
      );

      const status = await adapter.getStatus(POST_ID, TOKEN);
      expect(status.status).toBe("FAILED");
    });

    it("returns FAILED on API error", async () => {
      mockFetch.mockReturnValueOnce(
        fail({ error: "not_found", message: "Post not found" }, 404)
      );

      const status = await adapter.getStatus(POST_ID, TOKEN);
      expect(status.status).toBe("FAILED");
    });
  });

  // ── deletePost ─────────────────────────────────────────────────────────────

  describe("deletePost", () => {
    it("sends POST to /posts/{id}/delete and resolves on success", async () => {
      mockFetch.mockReturnValueOnce(
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          json: () => Promise.resolve({ ID: Number(POST_ID), status: "trash" }),
          headers: new Headers(),
        })
      );

      await expect(adapter.deletePost(POST_ID, TOKEN)).resolves.toBeUndefined();

      const [url] = mockFetch.mock.calls[0] as [string];
      expect(url).toContain(`/posts/${POST_ID}/delete`);
    });

    it("resolves on 404 (already deleted)", async () => {
      mockFetch.mockReturnValueOnce(
        Promise.resolve({
          ok: false,
          status: 404,
          statusText: "Not Found",
          json: () => Promise.resolve({}),
          headers: new Headers(),
        })
      );

      await expect(adapter.deletePost(POST_ID, TOKEN)).resolves.toBeUndefined();
    });

    it("throws on non-404 HTTP errors", async () => {
      mockFetch.mockReturnValueOnce(
        Promise.resolve({
          ok: false,
          status: 403,
          statusText: "Forbidden",
          json: () => Promise.resolve({}),
          headers: new Headers(),
        })
      );

      await expect(adapter.deletePost(POST_ID, TOKEN)).rejects.toThrow(
        "WordPress delete error (403)"
      );
    });
  });

  // ── getInsights ────────────────────────────────────────────────────────────

  describe("getInsights", () => {
    it("returns like_count and comment_count", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          ID: Number(POST_ID),
          status: "publish",
          like_count: 15,
          comment_count: 3,
        })
      );

      const insights = await adapter.getInsights(POST_ID, TOKEN);
      expect(insights.likes).toBe(15);
      expect(insights.comments).toBe(3);
    });

    it("returns empty object when ID is missing", async () => {
      mockFetch.mockReturnValueOnce(ok({ status: "publish" }));

      const insights = await adapter.getInsights(POST_ID, TOKEN);
      expect(insights).toEqual({});
    });

    it("returns empty object on HTTP error", async () => {
      mockFetch.mockReturnValueOnce(
        fail({ error: "server_error", message: "Internal server error" }, 500)
      );

      const insights = await adapter.getInsights(POST_ID, TOKEN);
      expect(insights).toEqual({});
    });
  });
});
