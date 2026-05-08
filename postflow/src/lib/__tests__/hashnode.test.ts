jest.mock("@prisma/client", () => ({
  MediaType: {
    NONE: "NONE",
    IMAGE: "IMAGE",
    VIDEO: "VIDEO",
    CAROUSEL: "CAROUSEL",
  },
}));

jest.mock("../auth/hashnode-oauth", () => ({
  parseHashnodeToken: (raw: string) => JSON.parse(raw),
}));

import { HashnodeAdapter } from "../platforms/hashnode";
import { MediaType } from "@prisma/client";

const mockFetch = jest.fn();

beforeAll(() => {
  global.fetch = mockFetch as unknown as typeof fetch;
});

beforeEach(() => {
  mockFetch.mockReset();
});

function gqlOk(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    statusText: "OK",
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: new Headers({ "content-type": "application/json" }),
  });
}

function httpFail(status = 500) {
  return Promise.resolve({
    ok: false,
    status,
    statusText: "Error",
    json: () => Promise.resolve({ errors: [{ message: "Server error" }] }),
    text: () => Promise.resolve("Server error"),
    headers: new Headers(),
  });
}

const ACCOUNT_ID = "acc_hashnode_001";
const API_TOKEN = "hashnode-personal-access-token-xyz";
const POST_ID = "hashnode-post-id-abc123";
const PUBLICATION_ID = "pub-id-0001";

const TOKEN = JSON.stringify({
  apiToken: API_TOKEN,
  username: "hnuser",
  name: "HN User",
  publicationId: PUBLICATION_ID,
  publicationUrl: "https://hnuser.hashnode.dev",
});

const PUBLISH_SUCCESS = {
  data: {
    publishPost: {
      post: {
        id: POST_ID,
        url: "https://hnuser.hashnode.dev/my-post-title",
        slug: "my-post-title",
        title: "My Post Title",
      },
    },
  },
};

const GET_POST_SUCCESS = {
  data: {
    post: {
      id: POST_ID,
      url: "https://hnuser.hashnode.dev/my-post-title",
      replyCount: 3,
      reactionCount: 15,
      views: 800,
    },
  },
};

describe("HashnodeAdapter", () => {
  let adapter: HashnodeAdapter;

  beforeEach(() => {
    adapter = new HashnodeAdapter();
  });

  // ── publish – NONE (text post) ─────────────────────────────────────────────

  describe("publish – NONE (text post)", () => {
    it("creates a published article and returns platformPostId + publishedUrl", async () => {
      mockFetch.mockReturnValueOnce(gqlOk(PUBLISH_SUCCESS));

      const result = await adapter.publish(
        {
          content: "My Post Title\nThis is the body of the article.",
          mediaType: MediaType.NONE,
          mediaUrls: [],
        },
        ACCOUNT_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe(POST_ID);
      expect(result.publishedUrl).toBe("https://hnuser.hashnode.dev/my-post-title");
      expect(result.publishedAt).toBeInstanceOf(Date);

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://gql.hashnode.com");
      expect(options.method).toBe("POST");
      expect(
        (options.headers as Record<string, string>)["Authorization"]
      ).toBe(API_TOKEN);

      const body = JSON.parse(options.body as string) as {
        variables: { input: { title: string; contentMarkdown: string; publicationId: string } };
      };
      expect(body.variables.input.title).toBe("My Post Title");
      expect(body.variables.input.contentMarkdown).toContain("body of the article");
      expect(body.variables.input.publicationId).toBe(PUBLICATION_ID);
    });

    it("uses full content as title when no newline present", async () => {
      mockFetch.mockReturnValueOnce(gqlOk(PUBLISH_SUCCESS));

      await adapter.publish(
        { content: "Short post content", mediaType: MediaType.NONE, mediaUrls: [] },
        ACCOUNT_ID,
        TOKEN
      );

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as {
        variables: { input: { title: string; contentMarkdown: string } };
      };
      expect(body.variables.input.title).toBe("Short post content");
      // When no body, contentMarkdown falls back to title
      expect(body.variables.input.contentMarkdown).toBe("Short post content");
    });

    it("truncates content to 40000 chars before splitting", async () => {
      const longContent = "A".repeat(50000);
      mockFetch.mockReturnValueOnce(gqlOk(PUBLISH_SUCCESS));

      await adapter.publish(
        { content: longContent, mediaType: MediaType.NONE, mediaUrls: [] },
        ACCOUNT_ID,
        TOKEN
      );

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as {
        variables: { input: { title: string } };
      };
      // Title is at most 255 chars (slice of the truncated content)
      expect(body.variables.input.title.length).toBeLessThanOrEqual(255);
    });

    it("throws on GraphQL-level errors", async () => {
      mockFetch.mockReturnValueOnce(
        gqlOk({ errors: [{ message: "Publication not found" }] })
      );

      await expect(
        adapter.publish(
          { content: "test", mediaType: MediaType.NONE, mediaUrls: [] },
          ACCOUNT_ID,
          TOKEN
        )
      ).rejects.toThrow("Hashnode GraphQL error: Publication not found");
    });

    it("throws on HTTP error", async () => {
      mockFetch.mockReturnValueOnce(httpFail(401));

      await expect(
        adapter.publish(
          { content: "test", mediaType: MediaType.NONE, mediaUrls: [] },
          ACCOUNT_ID,
          TOKEN
        )
      ).rejects.toThrow("Hashnode API error (401)");
    });
  });

  // ── publish – IMAGE (with embedded images) ────────────────────────────────

  describe("publish – IMAGE", () => {
    it("embeds image URLs as Markdown before article body", async () => {
      const imageUrl = "https://r2.example.com/photo.jpg";
      mockFetch.mockReturnValueOnce(gqlOk(PUBLISH_SUCCESS));

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
        variables: { input: { contentMarkdown: string } };
      };
      expect(body.variables.input.contentMarkdown).toContain(
        `![image-1](${imageUrl})`
      );
      expect(body.variables.input.contentMarkdown).toContain(
        "See the photo above."
      );
    });

    it("handles multiple images", async () => {
      const img1 = "https://r2.example.com/photo1.jpg";
      const img2 = "https://r2.example.com/photo2.jpg";
      mockFetch.mockReturnValueOnce(gqlOk(PUBLISH_SUCCESS));

      await adapter.publish(
        {
          content: "Multi-image Post\nBody text.",
          mediaType: MediaType.IMAGE,
          mediaUrls: [img1, img2],
        },
        ACCOUNT_ID,
        TOKEN
      );

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as {
        variables: { input: { contentMarkdown: string } };
      };
      expect(body.variables.input.contentMarkdown).toContain(`![image-1](${img1})`);
      expect(body.variables.input.contentMarkdown).toContain(`![image-2](${img2})`);
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
      ).rejects.toThrow("Hashnode adapter does not support VIDEO posts");
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
      ).rejects.toThrow("Hashnode adapter does not support CAROUSEL posts");
    });
  });

  // ── getStatus ──────────────────────────────────────────────────────────────

  describe("getStatus", () => {
    it("returns PUBLISHED when post exists", async () => {
      mockFetch.mockReturnValueOnce(gqlOk(GET_POST_SUCCESS));

      const status = await adapter.getStatus(POST_ID, TOKEN);
      expect(status.status).toBe("PUBLISHED");
    });

    it("returns FAILED when post is null (not found)", async () => {
      mockFetch.mockReturnValueOnce(
        gqlOk({ data: { post: null } })
      );

      const status = await adapter.getStatus(POST_ID, TOKEN);
      expect(status.status).toBe("FAILED");
    });

    it("returns FAILED on API error (swallows exception)", async () => {
      mockFetch.mockReturnValueOnce(httpFail(500));

      const status = await adapter.getStatus(POST_ID, TOKEN);
      expect(status.status).toBe("FAILED");
    });
  });

  // ── deletePost ─────────────────────────────────────────────────────────────

  describe("deletePost", () => {
    it("sends removePost mutation and resolves successfully", async () => {
      mockFetch.mockReturnValueOnce(
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          json: () =>
            Promise.resolve({ data: { removePost: { post: { id: POST_ID } } } }),
          text: () => Promise.resolve(""),
          headers: new Headers(),
        })
      );

      await expect(adapter.deletePost(POST_ID, TOKEN)).resolves.toBeUndefined();

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://gql.hashnode.com");
      expect(options.method).toBe("POST");

      const body = JSON.parse(options.body as string) as {
        variables: { id: string };
      };
      expect(body.variables.id).toBe(POST_ID);
    });

    it("resolves silently on 404 (post not found)", async () => {
      mockFetch.mockReturnValueOnce(
        Promise.resolve({
          ok: false,
          status: 404,
          statusText: "Not Found",
          json: () => Promise.resolve({}),
          text: () => Promise.resolve(""),
          headers: new Headers(),
        })
      );

      await expect(adapter.deletePost(POST_ID, TOKEN)).resolves.toBeUndefined();
    });

    it("throws on non-404 HTTP error", async () => {
      mockFetch.mockReturnValueOnce(httpFail(500));

      await expect(adapter.deletePost(POST_ID, TOKEN)).rejects.toThrow(
        "Hashnode delete error (500)"
      );
    });
  });

  // ── getInsights ────────────────────────────────────────────────────────────

  describe("getInsights", () => {
    it("returns views, reactions, and reply count from post data", async () => {
      mockFetch.mockReturnValueOnce(gqlOk(GET_POST_SUCCESS));

      const insights = await adapter.getInsights(POST_ID, TOKEN);
      expect(insights.impressions).toBe(800);
      expect(insights.likes).toBe(15);
      expect(insights.comments).toBe(3);
    });

    it("returns zeroed counts when fields are null", async () => {
      mockFetch.mockReturnValueOnce(
        gqlOk({
          data: {
            post: {
              id: POST_ID,
              url: null,
              replyCount: null,
              reactionCount: null,
              views: null,
            },
          },
        })
      );

      const insights = await adapter.getInsights(POST_ID, TOKEN);
      expect(insights.impressions).toBe(0);
      expect(insights.likes).toBe(0);
      expect(insights.comments).toBe(0);
    });

    it("returns empty object when post is null", async () => {
      mockFetch.mockReturnValueOnce(gqlOk({ data: { post: null } }));

      const insights = await adapter.getInsights(POST_ID, TOKEN);
      expect(insights).toEqual({});
    });

    it("returns empty object on API error (swallows exception)", async () => {
      mockFetch.mockReturnValueOnce(httpFail(500));

      const insights = await adapter.getInsights(POST_ID, TOKEN);
      expect(insights).toEqual({});
    });
  });
});
