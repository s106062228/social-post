jest.mock("@prisma/client", () => ({
  MediaType: {
    NONE: "NONE",
    IMAGE: "IMAGE",
    VIDEO: "VIDEO",
    CAROUSEL: "CAROUSEL",
  },
}));

jest.mock("../auth/beehiiv-oauth", () => ({
  parseBeehiivToken: (raw: string) => JSON.parse(raw),
}));

import { BeehiivAdapter } from "../platforms/beehiiv";
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

const ACCOUNT_ID = "acc_beehiiv_001";
const API_KEY = "bh-api-key-test-abc123";
const PUBLICATION_ID = "pub_test_publication_001";
const POST_ID = "post_abc123";

const TOKEN = JSON.stringify({
  apiKey: API_KEY,
  publicationId: PUBLICATION_ID,
  publicationName: "My Newsletter",
});

describe("BeehiivAdapter", () => {
  let adapter: BeehiivAdapter;

  beforeEach(() => {
    adapter = new BeehiivAdapter();
  });

  // ── publish – NONE (text post) ─────────────────────────────────────────────

  describe("publish – NONE (text post)", () => {
    it("creates a draft newsletter and returns platformPostId", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          data: {
            id: POST_ID,
            status: "draft",
            web_url: "https://beehiiv.com/p/my-post",
          },
        })
      );

      const result = await adapter.publish(
        {
          content: "My Newsletter Subject\nThis is the body of the newsletter.",
          mediaType: MediaType.NONE,
          mediaUrls: [],
        },
        ACCOUNT_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe(POST_ID);
      expect(result.publishedUrl).toBe("https://beehiiv.com/p/my-post");
      expect(result.publishedAt).toBeInstanceOf(Date);

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(`/publications/${PUBLICATION_ID}/posts`);
      expect(options.method).toBe("POST");

      const body = JSON.parse(options.body as string) as Record<string, unknown>;
      expect(body.subject_line).toBe("My Newsletter Subject");
      expect(body.status).toBe("draft");
      expect(typeof body.content_html).toBe("string");
      expect(body.content_html).toContain("My Newsletter Subject");
    });
  });

  // ── publish – title extraction ─────────────────────────────────────────────

  describe("publish – title extraction", () => {
    it("extracts first line as subject and rest as body", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          data: { id: POST_ID, status: "draft", web_url: null },
        })
      );

      const content = "Weekly Update\nLine 2\nLine 3";
      await adapter.publish(
        { content, mediaType: MediaType.NONE, mediaUrls: [] },
        ACCOUNT_ID,
        TOKEN
      );

      const body = JSON.parse(
        (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string
      ) as Record<string, unknown>;
      expect(body.subject_line).toBe("Weekly Update");
      expect((body.content_html as string)).toContain("Line 2");
    });
  });

  // ── publish – IMAGE (with embedded URL) ───────────────────────────────────

  describe("publish – IMAGE (image post with embedded URL)", () => {
    it("embeds the image URL in the HTML body", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          data: { id: POST_ID, status: "draft", web_url: null },
        })
      );

      const imageUrl = "https://example.com/image.png";
      const result = await adapter.publish(
        {
          content: "Photo Story\nCheck out this image.",
          mediaType: MediaType.IMAGE,
          mediaUrls: [imageUrl],
        },
        ACCOUNT_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe(POST_ID);

      const body = JSON.parse(
        (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string
      ) as Record<string, unknown>;
      expect(body.content_html).toContain(imageUrl);
      expect(body.content_html).toContain("<img");
    });
  });

  // ── publish – VIDEO unsupported ────────────────────────────────────────────

  describe("publish – VIDEO (unsupported)", () => {
    it("throws an error for VIDEO posts", async () => {
      await expect(
        adapter.publish(
          {
            content: "Video content",
            mediaType: MediaType.VIDEO,
            mediaUrls: ["https://example.com/video.mp4"],
          },
          ACCOUNT_ID,
          TOKEN
        )
      ).rejects.toThrow(/VIDEO/);
    });
  });

  // ── publish – CAROUSEL unsupported ────────────────────────────────────────

  describe("publish – CAROUSEL (unsupported)", () => {
    it("throws an error for CAROUSEL posts", async () => {
      await expect(
        adapter.publish(
          {
            content: "Carousel content",
            mediaType: MediaType.CAROUSEL,
            mediaUrls: [],
          },
          ACCOUNT_ID,
          TOKEN
        )
      ).rejects.toThrow(/CAROUSEL/);
    });
  });

  // ── getStatus – draft ─────────────────────────────────────────────────────

  describe("getStatus – draft", () => {
    it("returns PUBLISHED status for draft posts", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          data: { id: POST_ID, status: "draft" },
        })
      );

      const status = await adapter.getStatus(POST_ID, TOKEN);
      expect(status.status).toBe("PUBLISHED");
    });
  });

  // ── getStatus – confirmed ────────────────────────────────────────────────

  describe("getStatus – confirmed", () => {
    it("returns PUBLISHED status for confirmed posts", async () => {
      mockFetch.mockReturnValueOnce(
        ok({
          data: { id: POST_ID, status: "confirmed" },
        })
      );

      const status = await adapter.getStatus(POST_ID, TOKEN);
      expect(status.status).toBe("PUBLISHED");
    });
  });

  // ── deletePost – no-op ─────────────────────────────────────────────────────

  describe("deletePost", () => {
    it("resolves without calling fetch (no delete API)", async () => {
      await expect(adapter.deletePost(POST_ID, TOKEN)).resolves.toBeUndefined();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ── getInsights – empty ─────────────────────────────────────────────────────

  describe("getInsights", () => {
    it("returns empty insights object", async () => {
      const insights = await adapter.getInsights(POST_ID, TOKEN);
      expect(insights).toEqual({});
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
