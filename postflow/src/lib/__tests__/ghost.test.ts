jest.mock("@prisma/client", () => ({
  MediaType: {
    NONE: "NONE",
    IMAGE: "IMAGE",
    VIDEO: "VIDEO",
    CAROUSEL: "CAROUSEL",
  },
}));

jest.mock("../auth/ghost-oauth", () => ({
  parseGhostToken: (raw: string) => JSON.parse(raw),
  generateGhostJwt: () => "mock.jwt.token",
}));

import { GhostAdapter } from "../platforms/ghost";
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
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: new Headers({ "content-type": "application/json" }),
  });
}

function fail(data: unknown, status = 400) {
  return Promise.resolve({
    ok: false,
    status,
    statusText: "Error",
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: new Headers(),
  });
}

const ACCOUNT_ID = "acc_ghost_001";
const INSTANCE_URL = "https://myblog.ghost.io";
const ADMIN_API_KEY = "abcdef1234567890:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
const POST_ID = "ghost_post_id_1234";

const TOKEN = JSON.stringify({
  instanceUrl: INSTANCE_URL,
  adminApiKey: ADMIN_API_KEY,
  siteTitle: "My Blog",
  siteUrl: INSTANCE_URL,
});

describe("GhostAdapter", () => {
  let adapter: GhostAdapter;

  beforeEach(() => {
    adapter = new GhostAdapter();
  });

  // ── publish – NONE (text post) ─────────────────────────────────────────────

  describe("publish – NONE (text post)", () => {
    it("creates a text post and returns platformPostId + publishedUrl", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          posts: [
            {
              id: POST_ID,
              url: `${INSTANCE_URL}/my-post/`,
              status: "published",
            },
          ],
        })
      );

      const result = await adapter.publish(
        {
          content: "My Ghost Post Title\nThis is the body of the post.",
          mediaType: MediaType.NONE,
          mediaUrls: [],
        },
        ACCOUNT_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe(POST_ID);
      expect(result.publishedUrl).toContain(INSTANCE_URL);
      expect(result.publishedAt).toBeInstanceOf(Date);

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${INSTANCE_URL}/ghost/api/admin/posts/`);
      expect(options.method).toBe("POST");
      expect(
        (options.headers as Record<string, string>)["Authorization"]
      ).toBe("Ghost mock.jwt.token");

      const body = JSON.parse(options.body as string) as {
        posts: Array<{ title: string; status: string; html: string }>;
      };
      expect(body.posts[0].title).toBe("My Ghost Post Title");
      expect(body.posts[0].status).toBe("published");
    });

    it("uses full content as title when no newline present", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          posts: [{ id: POST_ID, url: `${INSTANCE_URL}/my-post/`, status: "published" }],
        })
      );

      await adapter.publish(
        { content: "Short post", mediaType: MediaType.NONE, mediaUrls: [] },
        ACCOUNT_ID,
        TOKEN
      );

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as {
        posts: Array<{ title: string }>;
      };
      expect(body.posts[0].title).toBe("Short post");
    });

    it("truncates content to 100000 chars", async () => {
      const longContent = "A".repeat(150000);

      mockFetch.mockReturnValueOnce(
        ok({
          posts: [{ id: POST_ID, url: `${INSTANCE_URL}/my-post/`, status: "published" }],
        })
      );

      await adapter.publish(
        { content: longContent, mediaType: MediaType.NONE, mediaUrls: [] },
        ACCOUNT_ID,
        TOKEN
      );

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as {
        posts: Array<{ title: string }>;
      };
      // Title is derived from the (already truncated) content
      expect(body.posts[0].title.length).toBeLessThanOrEqual(255);
    });

    it("throws on Ghost API error", async () => {
      mockFetch.mockReturnValueOnce(
        fail(
          { errors: [{ message: "Unauthorized: Admin API key is invalid", type: "UnauthorizedError" }] },
          401
        )
      );

      await expect(
        adapter.publish(
          { content: "test", mediaType: MediaType.NONE, mediaUrls: [] },
          ACCOUNT_ID,
          TOKEN
        )
      ).rejects.toThrow("Ghost API error (401)");
    });

    it("throws when posts array is empty", async () => {
      mockFetch.mockReturnValueOnce(ok({ posts: [] }));

      await expect(
        adapter.publish(
          { content: "test post", mediaType: MediaType.NONE, mediaUrls: [] },
          ACCOUNT_ID,
          TOKEN
        )
      ).rejects.toThrow("Ghost API returned empty posts array");
    });
  });

  // ── publish – IMAGE (with featured image) ─────────────────────────────────

  describe("publish – IMAGE", () => {
    it("sets feature_image on the post", async () => {
      const imageUrl = "https://r2.example.com/photo.jpg";

      mockFetch.mockReturnValueOnce(
        ok({
          posts: [
            {
              id: POST_ID,
              url: `${INSTANCE_URL}/my-post/`,
              status: "published",
            },
          ],
        })
      );

      const result = await adapter.publish(
        {
          content: "Post with Image\nSee the photo above.",
          mediaType: MediaType.IMAGE,
          mediaUrls: [imageUrl],
        },
        ACCOUNT_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe(POST_ID);

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as {
        posts: Array<{ feature_image: string }>;
      };
      expect(body.posts[0].feature_image).toBe(imageUrl);
    });

    it("does not set feature_image when mediaUrls is empty for IMAGE type", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          posts: [{ id: POST_ID, url: `${INSTANCE_URL}/my-post/`, status: "published" }],
        })
      );

      await adapter.publish(
        {
          content: "Image post without URL",
          mediaType: MediaType.IMAGE,
          mediaUrls: [],
        },
        ACCOUNT_ID,
        TOKEN
      );

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as {
        posts: Array<Record<string, unknown>>;
      };
      expect(body.posts[0].feature_image).toBeUndefined();
    });
  });

  // ── publish – unsupported media types ──────────────────────────────────────

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
      ).rejects.toThrow("Ghost adapter does not support VIDEO posts");
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
      ).rejects.toThrow("Ghost adapter does not support CAROUSEL posts");
    });
  });

  // ── getStatus ──────────────────────────────────────────────────────────────

  describe("getStatus", () => {
    it("returns PUBLISHED for published post", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ posts: [{ id: POST_ID, status: "published", url: `${INSTANCE_URL}/my-post/` }] })
      );

      const status = await adapter.getStatus(POST_ID, TOKEN);
      expect(status.status).toBe("PUBLISHED");
    });

    it("returns PENDING for scheduled post", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ posts: [{ id: POST_ID, status: "scheduled", url: null }] })
      );

      const status = await adapter.getStatus(POST_ID, TOKEN);
      expect(status.status).toBe("PENDING");
    });

    it("returns PENDING for draft post", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ posts: [{ id: POST_ID, status: "draft", url: null }] })
      );

      const status = await adapter.getStatus(POST_ID, TOKEN);
      expect(status.status).toBe("PENDING");
    });

    it("returns FAILED when posts array is empty", async () => {
      mockFetch.mockReturnValueOnce(ok({ posts: [] }));

      const status = await adapter.getStatus(POST_ID, TOKEN);
      expect(status.status).toBe("FAILED");
    });

    it("returns FAILED on API error (swallows exception)", async () => {
      mockFetch.mockReturnValueOnce(fail({ errors: [{ message: "Not Found" }] }, 404));

      const status = await adapter.getStatus(POST_ID, TOKEN);
      expect(status.status).toBe("FAILED");
    });
  });

  // ── deletePost ─────────────────────────────────────────────────────────────

  describe("deletePost", () => {
    it("sends DELETE request and resolves on success", async () => {
      mockFetch.mockReturnValueOnce(
        Promise.resolve({ ok: true, status: 204, statusText: "No Content" })
      );

      await expect(adapter.deletePost(POST_ID, TOKEN)).resolves.toBeUndefined();

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${INSTANCE_URL}/ghost/api/admin/posts/${POST_ID}/`);
      expect(options.method).toBe("DELETE");
    });

    it("resolves silently on 404 (post already deleted)", async () => {
      mockFetch.mockReturnValueOnce(
        Promise.resolve({ ok: false, status: 404, statusText: "Not Found" })
      );

      await expect(adapter.deletePost(POST_ID, TOKEN)).resolves.toBeUndefined();
    });

    it("throws on non-404 error", async () => {
      mockFetch.mockReturnValueOnce(
        Promise.resolve({ ok: false, status: 500, statusText: "Internal Server Error" })
      );

      await expect(adapter.deletePost(POST_ID, TOKEN)).rejects.toThrow(
        "Ghost delete error (500)"
      );
    });
  });

  // ── getInsights ────────────────────────────────────────────────────────────

  describe("getInsights", () => {
    it("returns empty object (no per-post insights API)", async () => {
      const insights = await adapter.getInsights(POST_ID, TOKEN);
      expect(insights).toEqual({});
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
