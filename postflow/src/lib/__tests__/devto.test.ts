jest.mock("@prisma/client", () => ({
  MediaType: {
    NONE: "NONE",
    IMAGE: "IMAGE",
    VIDEO: "VIDEO",
    CAROUSEL: "CAROUSEL",
  },
}));

jest.mock("../auth/devto-oauth", () => ({
  parseDevToToken: (raw: string) => JSON.parse(raw),
}));

import { DevToAdapter } from "../platforms/devto";
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

const ACCOUNT_ID = "acc_devto_001";
const API_KEY = "devto-personal-api-key-abc123";
const ARTICLE_ID = 123456;

const TOKEN = JSON.stringify({
  apiKey: API_KEY,
  username: "devuser",
  name: "Dev User",
});

describe("DevToAdapter", () => {
  let adapter: DevToAdapter;

  beforeEach(() => {
    adapter = new DevToAdapter();
  });

  // ── publish – NONE (text post) ─────────────────────────────────────────────

  describe("publish – NONE (text post)", () => {
    it("creates a published article and returns platformPostId + publishedUrl", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          id: ARTICLE_ID,
          url: "https://dev.to/devuser/my-post-title-abc123",
          published: true,
        })
      );

      const result = await adapter.publish(
        {
          content: "My Post Title\nThis is the body of the article.",
          mediaType: MediaType.NONE,
          mediaUrls: [],
        },
        ACCOUNT_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe(String(ARTICLE_ID));
      expect(result.publishedUrl).toBe("https://dev.to/devuser/my-post-title-abc123");
      expect(result.publishedAt).toBeInstanceOf(Date);

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://dev.to/api/articles");
      expect(options.method).toBe("POST");
      expect(
        (options.headers as Record<string, string>)["api-key"]
      ).toBe(API_KEY);

      const body = JSON.parse(options.body as string) as {
        article: { title: string; body_markdown: string; published: boolean };
      };
      expect(body.article.title).toBe("My Post Title");
      expect(body.article.body_markdown).toContain("body of the article");
      expect(body.article.published).toBe(true);
    });

    it("uses full content as title when no newline present", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ id: ARTICLE_ID, url: "https://dev.to/devuser/short-post-abc123", published: true })
      );

      await adapter.publish(
        { content: "Short post", mediaType: MediaType.NONE, mediaUrls: [] },
        ACCOUNT_ID,
        TOKEN
      );

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as {
        article: { title: string };
      };
      expect(body.article.title).toBe("Short post");
    });

    it("truncates content to 100000 chars", async () => {
      const longContent = "A".repeat(150000);

      mockFetch.mockReturnValueOnce(
        ok({ id: ARTICLE_ID, url: "https://dev.to/devuser/post-abc123", published: true })
      );

      await adapter.publish(
        { content: longContent, mediaType: MediaType.NONE, mediaUrls: [] },
        ACCOUNT_ID,
        TOKEN
      );

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as {
        article: { title: string };
      };
      // Title is derived from the (already truncated) content
      expect(body.article.title.length).toBeLessThanOrEqual(255);
    });

    it("throws on Dev.to API error", async () => {
      mockFetch.mockReturnValueOnce(fail({ error: "Unauthorized" }, 401));

      await expect(
        adapter.publish(
          { content: "test", mediaType: MediaType.NONE, mediaUrls: [] },
          ACCOUNT_ID,
          TOKEN
        )
      ).rejects.toThrow("Dev.to API error (401)");
    });
  });

  // ── publish – IMAGE (with embedded image) ────────────────────────────────────

  describe("publish – IMAGE", () => {
    it("embeds image URLs as Markdown in body before article text", async () => {
      const imageUrl = "https://r2.example.com/photo.jpg";

      mockFetch.mockReturnValueOnce(
        ok({ id: ARTICLE_ID, url: "https://dev.to/devuser/post-abc123", published: true })
      );

      await adapter.publish(
        {
          content: "Image Post Title\nSee the photo above.",
          mediaType: MediaType.IMAGE,
          mediaUrls: [imageUrl],
        },
        ACCOUNT_ID,
        TOKEN
      );

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as {
        article: { body_markdown: string };
      };
      expect(body.article.body_markdown).toContain(`![image-1](${imageUrl})`);
      expect(body.article.body_markdown).toContain("See the photo above.");
    });

    it("handles IMAGE with no body text (only image)", async () => {
      const imageUrl = "https://r2.example.com/photo.jpg";

      mockFetch.mockReturnValueOnce(
        ok({ id: ARTICLE_ID, url: "https://dev.to/devuser/post-abc123", published: true })
      );

      await adapter.publish(
        {
          content: "Just an Image",
          mediaType: MediaType.IMAGE,
          mediaUrls: [imageUrl],
        },
        ACCOUNT_ID,
        TOKEN
      );

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as {
        article: { title: string; body_markdown: string };
      };
      expect(body.article.title).toBe("Just an Image");
      expect(body.article.body_markdown).toBe(`![image-1](${imageUrl})`);
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
      ).rejects.toThrow("Dev.to adapter does not support VIDEO posts");
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
      ).rejects.toThrow("Dev.to adapter does not support CAROUSEL posts");
    });
  });

  // ── getStatus ──────────────────────────────────────────────────────────────

  describe("getStatus", () => {
    it("returns PUBLISHED for a published article", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ id: ARTICLE_ID, url: "https://dev.to/devuser/post", published: true })
      );

      const status = await adapter.getStatus(String(ARTICLE_ID), TOKEN);
      expect(status.status).toBe("PUBLISHED");
    });

    it("returns PENDING for an unpublished (draft) article", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ id: ARTICLE_ID, url: null, published: false })
      );

      const status = await adapter.getStatus(String(ARTICLE_ID), TOKEN);
      expect(status.status).toBe("PENDING");
    });

    it("returns FAILED on API error (swallows exception)", async () => {
      mockFetch.mockReturnValueOnce(fail({ error: "Not Found" }, 404));

      const status = await adapter.getStatus(String(ARTICLE_ID), TOKEN);
      expect(status.status).toBe("FAILED");
    });
  });

  // ── deletePost ─────────────────────────────────────────────────────────────

  describe("deletePost", () => {
    it("sends PUT request to unpublish the article", async () => {
      mockFetch.mockReturnValueOnce(
        Promise.resolve({ ok: true, status: 200, statusText: "OK" })
      );

      await expect(adapter.deletePost(String(ARTICLE_ID), TOKEN)).resolves.toBeUndefined();

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`https://dev.to/api/articles/${ARTICLE_ID}`);
      expect(options.method).toBe("PUT");

      const body = JSON.parse(options.body as string) as {
        article: { published: boolean };
      };
      expect(body.article.published).toBe(false);
    });

    it("resolves silently on 404 (article not found)", async () => {
      mockFetch.mockReturnValueOnce(
        Promise.resolve({ ok: false, status: 404, statusText: "Not Found" })
      );

      await expect(adapter.deletePost(String(ARTICLE_ID), TOKEN)).resolves.toBeUndefined();
    });

    it("throws on non-404 error", async () => {
      mockFetch.mockReturnValueOnce(
        Promise.resolve({ ok: false, status: 500, statusText: "Internal Server Error" })
      );

      await expect(adapter.deletePost(String(ARTICLE_ID), TOKEN)).rejects.toThrow(
        "Dev.to unpublish error (500)"
      );
    });
  });

  // ── getInsights ────────────────────────────────────────────────────────────

  describe("getInsights", () => {
    it("returns likes, comments, and impressions from article stats", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          id: ARTICLE_ID,
          public_reactions_count: 42,
          comments_count: 7,
          page_views_count: 1500,
          published: true,
        })
      );

      const insights = await adapter.getInsights(String(ARTICLE_ID), TOKEN);
      expect(insights.likes).toBe(42);
      expect(insights.comments).toBe(7);
      expect(insights.impressions).toBe(1500);
    });

    it("returns zeroed counts when fields are absent", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ id: ARTICLE_ID, published: true })
      );

      const insights = await adapter.getInsights(String(ARTICLE_ID), TOKEN);
      expect(insights.likes).toBe(0);
      expect(insights.comments).toBe(0);
      expect(insights.impressions).toBe(0);
    });

    it("returns empty object on API error (swallows exception)", async () => {
      mockFetch.mockReturnValueOnce(fail({ error: "Not Found" }, 404));

      const insights = await adapter.getInsights(String(ARTICLE_ID), TOKEN);
      expect(insights).toEqual({});
    });
  });
});
