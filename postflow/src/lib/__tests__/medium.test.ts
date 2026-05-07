jest.mock("@prisma/client", () => ({
  MediaType: {
    NONE: "NONE",
    IMAGE: "IMAGE",
    VIDEO: "VIDEO",
    CAROUSEL: "CAROUSEL",
  },
}));

jest.mock("../auth/medium-oauth", () => ({
  parseMediumToken: (raw: string) => JSON.parse(raw),
}));

import { MediumAdapter } from "../platforms/medium";
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

const ACCOUNT_ID = "abc123def456";
const TOKEN = JSON.stringify({
  accessToken: "medium_access_token",
  authorId: "abc123def456",
  authorName: "Test Author",
});
const POST_ID = "medium_post_id_1234";

describe("MediumAdapter", () => {
  let adapter: MediumAdapter;

  beforeEach(() => {
    adapter = new MediumAdapter();
  });

  // ── publish – NONE (text post) ─────────────────────────────────────────────

  describe("publish – NONE (text post)", () => {
    it("creates a text post and returns platformPostId + publishedUrl", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          data: {
            id: POST_ID,
            url: `https://medium.com/@author/${POST_ID}`,
          },
        })
      );

      const result = await adapter.publish(
        {
          content: "My Medium Story Title\nThis is the body of the story.",
          mediaType: MediaType.NONE,
          mediaUrls: [],
        },
        ACCOUNT_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe(POST_ID);
      expect(result.publishedUrl).toContain("medium.com");
      expect(result.publishedAt).toBeInstanceOf(Date);

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(`/users/${ACCOUNT_ID}/posts`);
      expect(options.method).toBe("POST");
      expect(
        (options.headers as Record<string, string>)["Authorization"]
      ).toBe("Bearer medium_access_token");

      const body = JSON.parse(options.body as string) as {
        title: string;
        contentFormat: string;
        publishStatus: string;
      };
      expect(body.title).toBe("My Medium Story Title");
      expect(body.contentFormat).toBe("html");
      expect(body.publishStatus).toBe("public");
    });

    it("uses full content as title when no newline in content", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ data: { id: POST_ID, url: `https://medium.com/@author/${POST_ID}` } })
      );

      await adapter.publish(
        { content: "Short story", mediaType: MediaType.NONE, mediaUrls: [] },
        ACCOUNT_ID,
        TOKEN
      );

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as { title: string };
      expect(body.title).toBe("Short story");
    });

    it("throws on Medium API error", async () => {
      mockFetch.mockReturnValueOnce(
        fail({ errors: [{ message: "Access token missing", code: 6003 }] }, 401)
      );

      await expect(
        adapter.publish(
          { content: "test", mediaType: MediaType.NONE, mediaUrls: [] },
          ACCOUNT_ID,
          TOKEN
        )
      ).rejects.toThrow("Medium API error (401)");
    });
  });

  // ── publish – IMAGE (with embedded image URL) ──────────────────────────────

  describe("publish – IMAGE", () => {
    it("embeds image URL in HTML content", async () => {
      const imageUrl = "https://cdn.example.com/photo.jpg";

      mockFetch.mockReturnValueOnce(
        ok({
          data: {
            id: POST_ID,
            url: `https://medium.com/@author/${POST_ID}`,
          },
        })
      );

      const result = await adapter.publish(
        {
          content: "Story with Image\nCheck out this photo below.",
          mediaType: MediaType.IMAGE,
          mediaUrls: [imageUrl],
        },
        ACCOUNT_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe(POST_ID);

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as { content: string };
      expect(body.content).toContain(`<img src="${imageUrl}" />`);
      expect(body.content).toContain("<figure>");
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
      ).rejects.toThrow("Medium adapter does not support VIDEO posts");
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
      ).rejects.toThrow("Medium adapter does not support CAROUSEL posts");
    });
  });

  // ── getStatus ──────────────────────────────────────────────────────────────

  describe("getStatus", () => {
    it("always returns PUBLISHED (no status API available)", async () => {
      const status = await adapter.getStatus(POST_ID, TOKEN);
      expect(status.status).toBe("PUBLISHED");
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ── deletePost ─────────────────────────────────────────────────────────────

  describe("deletePost", () => {
    it("resolves without making any API call (no public delete endpoint)", async () => {
      await expect(adapter.deletePost(POST_ID, TOKEN)).resolves.toBeUndefined();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ── getInsights ────────────────────────────────────────────────────────────

  describe("getInsights", () => {
    it("returns empty object (stats API not publicly available)", async () => {
      const insights = await adapter.getInsights(POST_ID, TOKEN);
      expect(insights).toEqual({});
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
