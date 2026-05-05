jest.mock("@prisma/client", () => ({
  MediaType: {
    NONE: "NONE",
    IMAGE: "IMAGE",
    VIDEO: "VIDEO",
    CAROUSEL: "CAROUSEL",
  },
}));

import { LinkedInAdapter } from "../platforms/linkedin";
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
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
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

const AUTHOR_URN = "urn:li:person:abc123";
const TOKEN = "test_linkedin_token";
const POST_URN = "urn:li:share:1234567890";

describe("LinkedInAdapter", () => {
  let adapter: LinkedInAdapter;

  beforeEach(() => {
    adapter = new LinkedInAdapter();
  });

  // ── publish – NONE (text post) ────────────────────────────────────────────

  describe("publish – NONE (text post)", () => {
    it("publishes a text post and returns platformPostId + publishedUrl", async () => {
      mockFetch.mockReturnValueOnce(ok({ id: POST_URN }));

      const result = await adapter.publish(
        { content: "Hello LinkedIn!", mediaType: MediaType.NONE, mediaUrls: [] },
        AUTHOR_URN,
        TOKEN
      );

      expect(result.platformPostId).toBe(POST_URN);
      expect(result.publishedUrl).toContain("linkedin.com");
      expect(result.publishedAt).toBeInstanceOf(Date);

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/rest/posts");
      expect((options.headers as Record<string, string>)["LinkedIn-Version"]).toBe("202406");

      const body = JSON.parse(options.body as string) as Record<string, unknown>;
      expect(body.author).toBe(AUTHOR_URN);
      expect(body.commentary).toBe("Hello LinkedIn!");
      expect(body.visibility).toBe("PUBLIC");
      expect(body.lifecycleState).toBe("PUBLISHED");
    });

    it("throws when API returns error", async () => {
      mockFetch.mockReturnValueOnce(
        fail({ message: "Access denied" }, 403)
      );

      await expect(
        adapter.publish(
          { content: "test", mediaType: MediaType.NONE, mediaUrls: [] },
          AUTHOR_URN,
          TOKEN
        )
      ).rejects.toThrow("LinkedIn API error (403): Access denied");
    });
  });

  // ── publish – IMAGE ───────────────────────────────────────────────────────

  describe("publish – IMAGE", () => {
    it("uploads image and publishes image post", async () => {
      // 1. initializeUpload response
      mockFetch.mockReturnValueOnce(
        ok({
          value: {
            uploadUrl: "https://api.linkedin.com/mediaUpload/upload-url",
            image: "urn:li:image:img123",
          },
        })
      );
      // 2. fetch the image from public URL
      mockFetch.mockReturnValueOnce(
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          headers: new Headers({ "content-type": "image/jpeg" }),
          json: () => Promise.resolve({}),
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
        })
      );
      // 3. PUT upload to LinkedIn
      mockFetch.mockReturnValueOnce(
        Promise.resolve({
          ok: true,
          status: 201,
          statusText: "Created",
          json: () => Promise.resolve({}),
        })
      );
      // 4. create post response
      mockFetch.mockReturnValueOnce(ok({ id: POST_URN }));

      const result = await adapter.publish(
        {
          content: "Check out this image",
          mediaType: MediaType.IMAGE,
          mediaUrls: ["https://example.com/image.jpg"],
        },
        AUTHOR_URN,
        TOKEN
      );

      expect(result.platformPostId).toBe(POST_URN);
      expect(mockFetch).toHaveBeenCalledTimes(4);

      // Verify init upload call
      const [initUrl] = mockFetch.mock.calls[0] as [string];
      expect(initUrl).toContain("images?action=initializeUpload");

      // Verify final post body has media content
      const [, postOptions] = mockFetch.mock.calls[3] as [string, RequestInit];
      const postBody = JSON.parse(postOptions.body as string) as Record<string, unknown>;
      expect((postBody.content as Record<string, unknown>)?.media).toBeDefined();
    });

    it("throws when IMAGE post has no media URLs", async () => {
      await expect(
        adapter.publish(
          { content: "test", mediaType: MediaType.IMAGE, mediaUrls: [] },
          AUTHOR_URN,
          TOKEN
        )
      ).rejects.toThrow("IMAGE post requires at least one media URL");
    });
  });

  // ── publish – unsupported types ───────────────────────────────────────────

  describe("publish – unsupported types", () => {
    it("throws for VIDEO posts", async () => {
      await expect(
        adapter.publish(
          {
            content: "video",
            mediaType: MediaType.VIDEO,
            mediaUrls: ["https://example.com/video.mp4"],
          },
          AUTHOR_URN,
          TOKEN
        )
      ).rejects.toThrow("LinkedIn adapter does not yet support VIDEO posts");
    });

    it("throws for CAROUSEL posts", async () => {
      await expect(
        adapter.publish(
          {
            content: "carousel",
            mediaType: MediaType.CAROUSEL,
            mediaUrls: [
              "https://example.com/1.jpg",
              "https://example.com/2.jpg",
            ],
          },
          AUTHOR_URN,
          TOKEN
        )
      ).rejects.toThrow("LinkedIn adapter does not yet support CAROUSEL posts");
    });
  });

  // ── getStatus ────────────────────────────────────────────────────────────

  describe("getStatus", () => {
    it("returns PUBLISHED when lifecycleState is PUBLISHED", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ id: POST_URN, lifecycleState: "PUBLISHED" })
      );

      const status = await adapter.getStatus(POST_URN, TOKEN);
      expect(status.status).toBe("PUBLISHED");
    });

    it("returns PROCESSING when lifecycleState is DRAFT", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ id: POST_URN, lifecycleState: "DRAFT" })
      );

      const status = await adapter.getStatus(POST_URN, TOKEN);
      expect(status.status).toBe("PROCESSING");
    });

    it("returns FAILED on API error", async () => {
      mockFetch.mockReturnValueOnce(fail({ message: "Not found" }, 404));

      const status = await adapter.getStatus(POST_URN, TOKEN);
      expect(status.status).toBe("FAILED");
      expect(status.error).toBeDefined();
    });
  });

  // ── deletePost ───────────────────────────────────────────────────────────

  describe("deletePost", () => {
    it("sends DELETE request successfully", async () => {
      mockFetch.mockReturnValueOnce(
        Promise.resolve({
          ok: true,
          status: 204,
          statusText: "No Content",
          json: () => Promise.resolve({}),
        })
      );

      await expect(adapter.deletePost(POST_URN, TOKEN)).resolves.toBeUndefined();

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(encodeURIComponent(POST_URN));
      expect(options.method).toBe("DELETE");
    });

    it("throws on delete error", async () => {
      mockFetch.mockReturnValueOnce(
        Promise.resolve({
          ok: false,
          status: 403,
          statusText: "Forbidden",
          json: () => Promise.resolve({ message: "Permission denied" }),
        })
      );

      await expect(adapter.deletePost(POST_URN, TOKEN)).rejects.toThrow(
        "LinkedIn delete error (403): Permission denied"
      );
    });
  });

  // ── getInsights ──────────────────────────────────────────────────────────

  describe("getInsights", () => {
    it("returns engagement metrics from socialMetadata endpoint", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          elements: [
            {
              totalShareStatistics: {
                likeCount: 42,
                commentCount: 7,
                shareCount: 3,
                impressionCount: 500,
                uniqueImpressionsCount: 400,
              },
            },
          ],
        })
      );

      const insights = await adapter.getInsights(POST_URN, TOKEN);
      expect(insights.likes).toBe(42);
      expect(insights.comments).toBe(7);
      expect(insights.shares).toBe(3);
      expect(insights.impressions).toBe(500);
      expect(insights.reach).toBe(400);
    });

    it("returns empty object when API fails", async () => {
      mockFetch.mockReturnValueOnce(fail({ message: "Error" }, 500));

      const insights = await adapter.getInsights(POST_URN, TOKEN);
      expect(insights).toEqual({});
    });

    it("returns empty object when elements array is empty", async () => {
      mockFetch.mockReturnValueOnce(ok({ elements: [] }));

      const insights = await adapter.getInsights(POST_URN, TOKEN);
      expect(insights).toEqual({});
    });
  });
});
