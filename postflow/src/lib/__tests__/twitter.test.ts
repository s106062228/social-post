jest.mock("@prisma/client", () => ({
  MediaType: {
    NONE: "NONE",
    IMAGE: "IMAGE",
    VIDEO: "VIDEO",
    CAROUSEL: "CAROUSEL",
  },
}));

import { TwitterAdapter } from "../platforms/twitter";
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
    headers: new Headers({ "content-type": "image/jpeg" }),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  });
}

function fail(data: unknown, status = 400) {
  return Promise.resolve({
    ok: false,
    status,
    statusText: "Error",
    json: () => Promise.resolve(data),
    headers: new Headers(),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  });
}

const ACCOUNT_ID = "twitter_user_123";
const TOKEN = "test_twitter_access_token";
const TWEET_ID = "1234567890123456789";

describe("TwitterAdapter", () => {
  let adapter: TwitterAdapter;

  beforeEach(() => {
    adapter = new TwitterAdapter();
  });

  // ── publish – NONE (text-only) ─────────────────────────────────────────────

  describe("publish – NONE (text-only)", () => {
    it("creates a tweet and returns platformPostId + publishedUrl", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ data: { id: TWEET_ID, text: "Hello Twitter!" } })
      );

      const result = await adapter.publish(
        { content: "Hello Twitter!", mediaType: MediaType.NONE, mediaUrls: [] },
        ACCOUNT_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe(TWEET_ID);
      expect(result.publishedUrl).toContain(TWEET_ID);
      expect(result.publishedAt).toBeInstanceOf(Date);

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/2/tweets");
      expect(options.method).toBe("POST");
      expect(
        (options.headers as Record<string, string>)["Authorization"]
      ).toBe(`Bearer ${TOKEN}`);

      const body = JSON.parse(options.body as string) as { text: string };
      expect(body.text).toBe("Hello Twitter!");
    });

    it("trims content to 280 characters", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ data: { id: TWEET_ID, text: "x".repeat(280) } })
      );

      const longContent = "x".repeat(400);
      await adapter.publish(
        { content: longContent, mediaType: MediaType.NONE, mediaUrls: [] },
        ACCOUNT_ID,
        TOKEN
      );

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as { text: string };
      expect(body.text.length).toBe(280);
    });

    it("throws on API error", async () => {
      mockFetch.mockReturnValueOnce(
        fail({ title: "Forbidden", detail: "Tweet creation not permitted" }, 403)
      );

      await expect(
        adapter.publish(
          { content: "test", mediaType: MediaType.NONE, mediaUrls: [] },
          ACCOUNT_ID,
          TOKEN
        )
      ).rejects.toThrow("Twitter API error (403)");
    });
  });

  // ── publish – IMAGE ────────────────────────────────────────────────────────

  describe("publish – IMAGE", () => {
    it("uploads media then creates tweet with media_ids", async () => {
      // 1st fetch: download image from CDN
      mockFetch.mockReturnValueOnce(
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          headers: new Headers({ "content-type": "image/jpeg" }),
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)),
          json: () => Promise.resolve({}),
        })
      );
      // 2nd fetch: upload to Twitter media endpoint
      mockFetch.mockReturnValueOnce(
        ok({ media_id_string: "media_999" })
      );
      // 3rd fetch: create tweet
      mockFetch.mockReturnValueOnce(
        ok({ data: { id: TWEET_ID, text: "Look at this image!" } })
      );

      const result = await adapter.publish(
        {
          content: "Look at this image!",
          mediaType: MediaType.IMAGE,
          mediaUrls: ["https://cdn.example.com/photo.jpg"],
        },
        ACCOUNT_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe(TWEET_ID);

      // Verify tweet body includes media_ids
      const [, options] = mockFetch.mock.calls[2] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as {
        text: string;
        media: { media_ids: string[] };
      };
      expect(body.media.media_ids).toContain("media_999");
    });

    it("throws when media upload fails", async () => {
      // 1st fetch: download image
      mockFetch.mockReturnValueOnce(
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          headers: new Headers({ "content-type": "image/jpeg" }),
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)),
          json: () => Promise.resolve({}),
        })
      );
      // 2nd fetch: media upload fails
      mockFetch.mockReturnValueOnce(
        fail({ title: "Unauthorized" }, 401)
      );

      await expect(
        adapter.publish(
          {
            content: "test",
            mediaType: MediaType.IMAGE,
            mediaUrls: ["https://cdn.example.com/photo.jpg"],
          },
          ACCOUNT_ID,
          TOKEN
        )
      ).rejects.toThrow("Twitter media upload error (401)");
    });

    it("skips media upload when mediaUrls is empty", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ data: { id: TWEET_ID, text: "text only" } })
      );

      const result = await adapter.publish(
        { content: "text only", mediaType: MediaType.IMAGE, mediaUrls: [] },
        ACCOUNT_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe(TWEET_ID);
      // Only one fetch (no upload)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // ── publish – unsupported types ────────────────────────────────────────────

  describe("publish – unsupported media types", () => {
    it("throws for VIDEO", async () => {
      await expect(
        adapter.publish(
          {
            content: "video",
            mediaType: MediaType.VIDEO,
            mediaUrls: ["https://example.com/video.mp4"],
          },
          ACCOUNT_ID,
          TOKEN
        )
      ).rejects.toThrow("Twitter adapter supports NONE and IMAGE posts");
    });

    it("throws for CAROUSEL", async () => {
      await expect(
        adapter.publish(
          {
            content: "carousel",
            mediaType: MediaType.CAROUSEL,
            mediaUrls: [],
          },
          ACCOUNT_ID,
          TOKEN
        )
      ).rejects.toThrow("Twitter adapter supports NONE and IMAGE posts");
    });
  });

  // ── getStatus ──────────────────────────────────────────────────────────────

  describe("getStatus", () => {
    it("returns PUBLISHED when tweet exists", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ data: { id: TWEET_ID, text: "Hello!" } })
      );

      const status = await adapter.getStatus(TWEET_ID, TOKEN);
      expect(status.status).toBe("PUBLISHED");
    });

    it("returns FAILED when tweet data is missing in response", async () => {
      mockFetch.mockReturnValueOnce(ok({ errors: [{ title: "Not Found" }] }));

      const status = await adapter.getStatus(TWEET_ID, TOKEN);
      expect(status.status).toBe("FAILED");
    });

    it("returns FAILED on HTTP error", async () => {
      mockFetch.mockReturnValueOnce(fail({ title: "Not Found" }, 404));

      const status = await adapter.getStatus(TWEET_ID, TOKEN);
      expect(status.status).toBe("FAILED");
      expect(status.error).toContain("404");
    });
  });

  // ── deletePost ─────────────────────────────────────────────────────────────

  describe("deletePost", () => {
    it("sends DELETE /2/tweets/:id and resolves on 200", async () => {
      mockFetch.mockReturnValueOnce(
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          json: () => Promise.resolve({ data: { deleted: true } }),
        })
      );

      await expect(
        adapter.deletePost(TWEET_ID, TOKEN)
      ).resolves.toBeUndefined();

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(`/2/tweets/${TWEET_ID}`);
      expect(options.method).toBe("DELETE");
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
        adapter.deletePost(TWEET_ID, TOKEN)
      ).resolves.toBeUndefined();
    });

    it("throws on other HTTP errors", async () => {
      mockFetch.mockReturnValueOnce(
        Promise.resolve({
          ok: false,
          status: 403,
          statusText: "Forbidden",
          json: () =>
            Promise.resolve({ detail: "Insufficient permissions" }),
        })
      );

      await expect(adapter.deletePost(TWEET_ID, TOKEN)).rejects.toThrow(
        "Twitter delete error (403)"
      );
    });
  });

  // ── getInsights ────────────────────────────────────────────────────────────

  describe("getInsights", () => {
    it("returns mapped engagement metrics", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          data: {
            id: TWEET_ID,
            public_metrics: {
              impression_count: 15000,
              like_count: 420,
              reply_count: 33,
              retweet_count: 88,
            },
          },
        })
      );

      const insights = await adapter.getInsights(TWEET_ID, TOKEN);
      expect(insights.impressions).toBe(15000);
      expect(insights.likes).toBe(420);
      expect(insights.comments).toBe(33);
      expect(insights.shares).toBe(88);
    });

    it("returns empty object when no public_metrics", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ data: { id: TWEET_ID } })
      );

      const insights = await adapter.getInsights(TWEET_ID, TOKEN);
      expect(insights).toEqual({});
    });

    it("returns empty object on HTTP error", async () => {
      mockFetch.mockReturnValueOnce(fail({}, 500));

      const insights = await adapter.getInsights(TWEET_ID, TOKEN);
      expect(insights).toEqual({});
    });
  });

  // ── addComment ─────────────────────────────────────────────────────────────

  describe("addComment", () => {
    it("creates a reply tweet with in_reply_to_tweet_id", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ data: { id: "reply_tweet_id", text: "Great post!" } })
      );

      await adapter.addComment(TWEET_ID, "Great post!", TOKEN);

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/2/tweets");
      expect(options.method).toBe("POST");

      const body = JSON.parse(options.body as string) as {
        text: string;
        reply: { in_reply_to_tweet_id: string };
      };
      expect(body.text).toBe("Great post!");
      expect(body.reply.in_reply_to_tweet_id).toBe(TWEET_ID);
    });

    it("trims comment to 280 chars", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ data: { id: "reply_tweet_id", text: "x".repeat(280) } })
      );

      await adapter.addComment(TWEET_ID, "x".repeat(400), TOKEN);

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as { text: string };
      expect(body.text.length).toBe(280);
    });
  });

  // ── publish – thread ───────────────────────────────────────────────────────

  describe("publish – thread", () => {
    it("publishes first tweet then reply-chain thread items", async () => {
      // First tweet
      mockFetch.mockReturnValueOnce(ok({ data: { id: "tweet_1", text: "First tweet" } }));
      // Thread item 1 (reply)
      mockFetch.mockReturnValueOnce(ok({ data: { id: "tweet_2", text: "Thread item 1" } }));
      // Thread item 2 (reply to tweet_2)
      mockFetch.mockReturnValueOnce(ok({ data: { id: "tweet_3", text: "Thread item 2" } }));

      const result = await adapter.publish(
        {
          content: "First tweet",
          mediaType: MediaType.NONE,
          mediaUrls: [],
          threadItems: [
            { content: "Thread item 1", mediaUrls: [], mediaType: MediaType.NONE },
            { content: "Thread item 2", mediaUrls: [], mediaType: MediaType.NONE },
          ],
        },
        ACCOUNT_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe("tweet_1");
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // Second call should reply to tweet_1
      const [, secondOptions] = mockFetch.mock.calls[1] as [string, RequestInit];
      const secondBody = JSON.parse(secondOptions.body as string) as {
        text: string;
        reply: { in_reply_to_tweet_id: string };
      };
      expect(secondBody.reply.in_reply_to_tweet_id).toBe("tweet_1");

      // Third call should reply to tweet_2
      const [, thirdOptions] = mockFetch.mock.calls[2] as [string, RequestInit];
      const thirdBody = JSON.parse(thirdOptions.body as string) as {
        text: string;
        reply: { in_reply_to_tweet_id: string };
      };
      expect(thirdBody.reply.in_reply_to_tweet_id).toBe("tweet_2");
    });

    it("publishes normally without thread items", async () => {
      mockFetch.mockReturnValueOnce(ok({ data: { id: TWEET_ID, text: "Solo tweet" } }));

      const result = await adapter.publish(
        {
          content: "Solo tweet",
          mediaType: MediaType.NONE,
          mediaUrls: [],
          threadItems: [],
        },
        ACCOUNT_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe(TWEET_ID);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
