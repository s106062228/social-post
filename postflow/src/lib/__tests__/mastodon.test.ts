jest.mock("@prisma/client", () => ({
  MediaType: {
    NONE: "NONE",
    IMAGE: "IMAGE",
    VIDEO: "VIDEO",
    CAROUSEL: "CAROUSEL",
  },
}));

// Mock mastodon-oauth to avoid real network calls
jest.mock("../auth/mastodon-oauth", () => ({
  parseMastodonToken: (token: string) => JSON.parse(token) as Record<string, string>,
  verifyMastodonToken: jest.fn(),
  serializeMastodonToken: (data: unknown) => JSON.stringify(data),
}));

import { MastodonAdapter } from "../platforms/mastodon";
import { MediaType } from "@prisma/client";

const mockFetch = jest.fn();

beforeAll(() => {
  global.fetch = mockFetch as unknown as typeof fetch;
});

beforeEach(() => {
  mockFetch.mockReset();
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function ok(data: unknown, status = 200, contentType = "application/json") {
  return Promise.resolve({
    ok: true,
    status,
    statusText: "OK",
    json: () => Promise.resolve(data),
    headers: new Headers({ "content-type": contentType }),
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

// ── Test fixtures ─────────────────────────────────────────────────────────────

const INSTANCE = "https://mastodon.social";
const ACCESS_TOKEN = "test_access_token_abc";
const ACCOUNT_ID = "12345678";
const USERNAME = "testuser@mastodon.social";
const STATUS_ID = "109876543210";
const STATUS_URL = `${INSTANCE}/@testuser/${STATUS_ID}`;

const TOKEN = JSON.stringify({
  instanceUrl: INSTANCE,
  accessToken: ACCESS_TOKEN,
  accountId: ACCOUNT_ID,
  username: USERNAME,
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("MastodonAdapter", () => {
  let adapter: MastodonAdapter;

  beforeEach(() => {
    adapter = new MastodonAdapter();
  });

  // ── publish – NONE (text-only) ─────────────────────────────────────────────

  describe("publish – NONE (text-only)", () => {
    it("creates a status and returns correct platformPostId and URL", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ id: STATUS_ID, url: STATUS_URL, uri: STATUS_URL })
      );

      const result = await adapter.publish(
        { content: "Hello Mastodon!", mediaType: MediaType.NONE, mediaUrls: [] },
        ACCOUNT_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe(STATUS_ID);
      expect(result.publishedUrl).toBe(STATUS_URL);
      expect(result.publishedAt).toBeInstanceOf(Date);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(`${INSTANCE}/api/v1/statuses`);
      expect(options.method).toBe("POST");
      expect(
        (options.headers as Record<string, string>)["Authorization"]
      ).toBe(`Bearer ${ACCESS_TOKEN}`);
    });

    it("truncates content to 500 characters", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ id: STATUS_ID, url: STATUS_URL, uri: STATUS_URL })
      );

      const longContent = "B".repeat(700);
      await adapter.publish(
        { content: longContent, mediaType: MediaType.NONE, mediaUrls: [] },
        ACCOUNT_ID,
        TOKEN
      );

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = options.body as FormData;
      expect((body.get("status") as string).length).toBe(500);
    });
  });

  // ── publish – IMAGE ────────────────────────────────────────────────────────

  describe("publish – IMAGE", () => {
    it("uploads media and attaches media_ids to the status", async () => {
      // First call: fetch image
      mockFetch.mockReturnValueOnce(ok(null, 200, "image/jpeg"));
      // Second call: upload to /api/v2/media
      mockFetch.mockReturnValueOnce(
        ok({ id: "media_001", type: "image", url: "https://cdn.mastodon.social/img.jpg" })
      );
      // Third call: create status
      mockFetch.mockReturnValueOnce(
        ok({ id: STATUS_ID, url: STATUS_URL, uri: STATUS_URL })
      );

      const result = await adapter.publish(
        {
          content: "Image post!",
          mediaType: MediaType.IMAGE,
          mediaUrls: ["https://example.com/photo.jpg"],
        },
        ACCOUNT_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe(STATUS_ID);
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // Verify media upload call went to /api/v2/media
      const [mediaUploadUrl] = mockFetch.mock.calls[1] as [string, RequestInit];
      expect(mediaUploadUrl).toContain("/api/v2/media");

      // Verify status creation includes media_ids
      const [, statusOptions] = mockFetch.mock.calls[2] as [string, RequestInit];
      const statusBody = statusOptions.body as FormData;
      expect(statusBody.getAll("media_ids[]")).toContain("media_001");
    });

    it("throws when image fetch fails", async () => {
      mockFetch.mockReturnValueOnce(fail({ error: "Not Found" }, 404));

      await expect(
        adapter.publish(
          {
            content: "Image post!",
            mediaType: MediaType.IMAGE,
            mediaUrls: ["https://example.com/missing.jpg"],
          },
          ACCOUNT_ID,
          TOKEN
        )
      ).rejects.toThrow("Failed to fetch media from URL");
    });

    it("throws when media upload fails", async () => {
      mockFetch.mockReturnValueOnce(ok(null, 200, "image/jpeg"));
      mockFetch.mockReturnValueOnce(fail({ error: "Upload error" }, 500));

      await expect(
        adapter.publish(
          {
            content: "Image post!",
            mediaType: MediaType.IMAGE,
            mediaUrls: ["https://example.com/photo.jpg"],
          },
          ACCOUNT_ID,
          TOKEN
        )
      ).rejects.toThrow("Mastodon media upload error");
    });

    it("uploads at most 4 images", async () => {
      // 4 image fetches + 4 uploads + 1 status creation = 9 calls
      for (let i = 0; i < 4; i++) {
        mockFetch.mockReturnValueOnce(ok(null, 200, "image/jpeg"));
        mockFetch.mockReturnValueOnce(
          ok({ id: `media_00${i}`, type: "image", url: `https://cdn.example.com/img${i}.jpg` })
        );
      }
      mockFetch.mockReturnValueOnce(
        ok({ id: STATUS_ID, url: STATUS_URL, uri: STATUS_URL })
      );

      await adapter.publish(
        {
          content: "Multiple images!",
          mediaType: MediaType.IMAGE,
          mediaUrls: [
            "https://example.com/1.jpg",
            "https://example.com/2.jpg",
            "https://example.com/3.jpg",
            "https://example.com/4.jpg",
            "https://example.com/5.jpg", // 5th should be ignored
          ],
        },
        ACCOUNT_ID,
        TOKEN
      );

      // 4 fetches + 4 uploads + 1 status = 9 total (not 11 which would include the 5th)
      expect(mockFetch).toHaveBeenCalledTimes(9);
    });
  });

  // ── publish – unsupported types ────────────────────────────────────────────

  describe("publish – unsupported media types", () => {
    it("throws for VIDEO", async () => {
      await expect(
        adapter.publish(
          {
            content: "Video!",
            mediaType: MediaType.VIDEO,
            mediaUrls: ["https://example.com/video.mp4"],
          },
          ACCOUNT_ID,
          TOKEN
        )
      ).rejects.toThrow("does not support VIDEO");
    });

    it("throws for CAROUSEL", async () => {
      await expect(
        adapter.publish(
          {
            content: "Carousel!",
            mediaType: MediaType.CAROUSEL,
            mediaUrls: ["https://example.com/img1.jpg"],
          },
          ACCOUNT_ID,
          TOKEN
        )
      ).rejects.toThrow("does not support CAROUSEL");
    });
  });

  // ── getStatus ──────────────────────────────────────────────────────────────

  describe("getStatus", () => {
    it("returns PUBLISHED when status exists", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ id: STATUS_ID, url: STATUS_URL, uri: STATUS_URL })
      );

      const status = await adapter.getStatus(STATUS_ID, TOKEN);
      expect(status.status).toBe("PUBLISHED");
    });

    it("returns FAILED when status is not found", async () => {
      mockFetch.mockReturnValueOnce(
        fail({ error: "Record not found" }, 404)
      );

      const status = await adapter.getStatus(STATUS_ID, TOKEN);
      expect(status.status).toBe("FAILED");
      expect(status.error).toBeTruthy();
    });
  });

  // ── deletePost ─────────────────────────────────────────────────────────────

  describe("deletePost", () => {
    it("calls DELETE on the statuses endpoint", async () => {
      mockFetch.mockReturnValueOnce(ok({}));

      await adapter.deletePost(STATUS_ID, TOKEN);

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(`/api/v1/statuses/${STATUS_ID}`);
      expect(options.method).toBe("DELETE");
      expect(
        (options.headers as Record<string, string>)["Authorization"]
      ).toBe(`Bearer ${ACCESS_TOKEN}`);
    });

    it("throws when delete fails", async () => {
      mockFetch.mockReturnValueOnce(fail({}, 403));

      await expect(adapter.deletePost(STATUS_ID, TOKEN)).rejects.toThrow(
        "Mastodon delete failed"
      );
    });
  });

  // ── getInsights ────────────────────────────────────────────────────────────

  describe("getInsights", () => {
    it("returns empty insights object (Mastodon has no metrics API)", async () => {
      const insights = await adapter.getInsights(STATUS_ID, TOKEN);
      expect(insights).toEqual({});
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
