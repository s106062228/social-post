jest.mock("@prisma/client", () => ({
  MediaType: {
    NONE: "NONE",
    IMAGE: "IMAGE",
    VIDEO: "VIDEO",
    CAROUSEL: "CAROUSEL",
  },
}));

// Mock the reddit-oauth module so parseRedditToken works without real crypto
jest.mock("../auth/reddit-oauth", () => ({
  parseRedditToken: (raw: string) => JSON.parse(raw),
}));

import { RedditAdapter } from "../platforms/reddit";
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

const ACCOUNT_ID = "reddit_user_abc123";
const TOKEN = JSON.stringify({
  accessToken: "reddit_access_token",
  refreshToken: "reddit_refresh_token",
  username: "test_user",
  subreddits: ["testsubreddit"],
});
const POST_FULLNAME = "t3_abc123";
const POST_ID = "abc123";

describe("RedditAdapter", () => {
  let adapter: RedditAdapter;

  beforeEach(() => {
    adapter = new RedditAdapter();
  });

  // ── publish – NONE (text post) ─────────────────────────────────────────────

  describe("publish – NONE (text/self post)", () => {
    it("creates a self post and returns platformPostId + publishedUrl", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          json: {
            data: { id: POST_ID, name: POST_FULLNAME, url: `https://www.reddit.com/r/testsubreddit/comments/${POST_ID}/` },
            errors: [],
          },
        })
      );

      const result = await adapter.publish(
        {
          content: "Test Title\nTest body content",
          mediaType: MediaType.NONE,
          mediaUrls: [],
        },
        ACCOUNT_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe(POST_FULLNAME);
      expect(result.publishedUrl).toContain("reddit.com");
      expect(result.publishedAt).toBeInstanceOf(Date);

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/api/submit");
      expect(options.method).toBe("POST");
      expect((options.headers as Record<string, string>)["Authorization"]).toBe(
        "Bearer reddit_access_token"
      );
      const body = new URLSearchParams(options.body as string);
      expect(body.get("kind")).toBe("self");
      expect(body.get("sr")).toBe("testsubreddit");
    });

    it("uses subreddit: prefix in accountId when provided", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          json: {
            data: { id: POST_ID, name: POST_FULLNAME, url: "https://www.reddit.com/r/mysubreddit/comments/abc123/" },
            errors: [],
          },
        })
      );

      await adapter.publish(
        { content: "Hello Reddit", mediaType: MediaType.NONE, mediaUrls: [] },
        "subreddit:mysubreddit",
        TOKEN
      );

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = new URLSearchParams(options.body as string);
      expect(body.get("sr")).toBe("mysubreddit");
    });

    it("splits first line as title and rest as body text", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          json: {
            data: { id: POST_ID, name: POST_FULLNAME, url: "https://reddit.com/r/x/comments/abc/" },
            errors: [],
          },
        })
      );

      await adapter.publish(
        {
          content: "My Post Title\nThis is the body of the post.",
          mediaType: MediaType.NONE,
          mediaUrls: [],
        },
        ACCOUNT_ID,
        TOKEN
      );

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = new URLSearchParams(options.body as string);
      expect(body.get("title")).toBe("My Post Title");
      expect(body.get("text")).toBe("This is the body of the post.");
    });

    it("throws on API error response", async () => {
      mockFetch.mockReturnValueOnce(
        fail({ error: "RATELIMIT", message: "You are doing that too much." }, 429)
      );

      await expect(
        adapter.publish(
          { content: "test", mediaType: MediaType.NONE, mediaUrls: [] },
          ACCOUNT_ID,
          TOKEN
        )
      ).rejects.toThrow("Reddit API error (429)");
    });

    it("throws when json.errors is non-empty", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          json: {
            data: {},
            errors: [["SUBREDDIT_NOTALLOWED", "You are not allowed to post here.", ""]],
          },
        })
      );

      await expect(
        adapter.publish(
          { content: "test", mediaType: MediaType.NONE, mediaUrls: [] },
          ACCOUNT_ID,
          TOKEN
        )
      ).rejects.toThrow("Reddit submit error");
    });
  });

  // ── publish – IMAGE (link post) ────────────────────────────────────────────

  describe("publish – IMAGE (link post)", () => {
    it("creates a link post with the image URL", async () => {
      const imageUrl = "https://cdn.example.com/photo.jpg";

      mockFetch.mockReturnValueOnce(
        ok({
          json: {
            data: { id: POST_ID, name: POST_FULLNAME, url: imageUrl },
            errors: [],
          },
        })
      );

      const result = await adapter.publish(
        {
          content: "Check out this image",
          mediaType: MediaType.IMAGE,
          mediaUrls: [imageUrl],
        },
        ACCOUNT_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe(POST_FULLNAME);

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = new URLSearchParams(options.body as string);
      expect(body.get("kind")).toBe("link");
      expect(body.get("url")).toBe(imageUrl);
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
      ).rejects.toThrow("Reddit adapter supports NONE and IMAGE posts");
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
      ).rejects.toThrow("Reddit adapter supports NONE and IMAGE posts");
    });
  });

  // ── getStatus ──────────────────────────────────────────────────────────────

  describe("getStatus", () => {
    it("returns PUBLISHED when post exists and is not removed", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          data: {
            children: [
              {
                data: {
                  id: POST_ID,
                  name: POST_FULLNAME,
                  removed_by_category: null,
                  score: 42,
                },
              },
            ],
          },
        })
      );

      const status = await adapter.getStatus(POST_FULLNAME, TOKEN);
      expect(status.status).toBe("PUBLISHED");
    });

    it("returns FAILED when no post found", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ data: { children: [] } })
      );

      const status = await adapter.getStatus(POST_FULLNAME, TOKEN);
      expect(status.status).toBe("FAILED");
      expect(status.error).toContain("not found");
    });

    it("returns FAILED when post is removed", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          data: {
            children: [
              {
                data: {
                  id: POST_ID,
                  name: POST_FULLNAME,
                  removed_by_category: "moderator",
                },
              },
            ],
          },
        })
      );

      const status = await adapter.getStatus(POST_FULLNAME, TOKEN);
      expect(status.status).toBe("FAILED");
      expect(status.error).toContain("removed");
    });

    it("prepends t3_ prefix when not present", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ data: { children: [{ data: { id: POST_ID, name: POST_FULLNAME, removed_by_category: null } }] } })
      );

      await adapter.getStatus(POST_ID, TOKEN);

      const [url] = mockFetch.mock.calls[0] as [string];
      expect(url).toContain(`id=t3_${POST_ID}`);
    });
  });

  // ── deletePost ─────────────────────────────────────────────────────────────

  describe("deletePost", () => {
    it("sends POST to /api/del and resolves on 200", async () => {
      mockFetch.mockReturnValueOnce(
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          json: () => Promise.resolve({}),
        })
      );

      await expect(adapter.deletePost(POST_FULLNAME, TOKEN)).resolves.toBeUndefined();

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/api/del");
      expect(options.method).toBe("POST");
      const body = new URLSearchParams(options.body as string);
      expect(body.get("id")).toBe(POST_FULLNAME);
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

      await expect(adapter.deletePost(POST_FULLNAME, TOKEN)).resolves.toBeUndefined();
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

      await expect(adapter.deletePost(POST_FULLNAME, TOKEN)).rejects.toThrow(
        "Reddit delete error (403)"
      );
    });
  });

  // ── getInsights ────────────────────────────────────────────────────────────

  describe("getInsights", () => {
    it("returns mapped engagement metrics", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          data: {
            children: [
              {
                data: {
                  id: POST_ID,
                  name: POST_FULLNAME,
                  ups: 250,
                  num_comments: 42,
                  view_count: 5000,
                  removed_by_category: null,
                },
              },
            ],
          },
        })
      );

      const insights = await adapter.getInsights(POST_FULLNAME, TOKEN);
      expect(insights.likes).toBe(250);
      expect(insights.comments).toBe(42);
      expect(insights.impressions).toBe(5000);
    });

    it("returns empty object when no post found", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ data: { children: [] } })
      );

      const insights = await adapter.getInsights(POST_FULLNAME, TOKEN);
      expect(insights).toEqual({});
    });

    it("returns empty object on HTTP error", async () => {
      mockFetch.mockReturnValueOnce(fail({}, 500));

      const insights = await adapter.getInsights(POST_FULLNAME, TOKEN);
      expect(insights).toEqual({});
    });
  });
});
