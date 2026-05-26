jest.mock("@prisma/client", () => ({
  MediaType: {
    NONE: "NONE",
    IMAGE: "IMAGE",
    VIDEO: "VIDEO",
    CAROUSEL: "CAROUSEL",
  },
}));

jest.mock("../auth/pixelfed-oauth", () => ({
  parsePixelfedToken: (raw: string) => JSON.parse(raw),
}));

import { PixelfedAdapter } from "../platforms/pixelfed";
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

const INSTANCE_URL = "https://pixelfed.social";
const ACCESS_TOKEN = "pxl-token-abc123";
const ACCOUNT_ID = "pxl-account-001";

const TOKEN = JSON.stringify({
  instanceUrl: INSTANCE_URL,
  accessToken: ACCESS_TOKEN,
  accountId: ACCOUNT_ID,
  username: "testuser",
});

describe("PixelfedAdapter", () => {
  const adapter = new PixelfedAdapter();

  describe("publish — text post (NONE)", () => {
    it("posts a status and returns platformPostId", async () => {
      mockFetch.mockResolvedValueOnce(
        ok({ id: "status-123", url: `${INSTANCE_URL}/@testuser/123`, uri: "https://pixelfed.social/p/testuser/123" })
      );

      const result = await adapter.publish(
        { content: "Hello Pixelfed!", mediaType: MediaType.NONE, mediaUrls: [] },
        ACCOUNT_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe("status-123");
      expect(result.publishedUrl).toContain("testuser");
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url] = mockFetch.mock.calls[0] as [string, ...unknown[]];
      expect(url).toBe(`${INSTANCE_URL}/api/v1/statuses`);
    });
  });

  describe("publish — content truncation", () => {
    it("truncates content to 500 characters", async () => {
      mockFetch.mockResolvedValueOnce(
        ok({ id: "status-456", url: `${INSTANCE_URL}/p/u/456`, uri: `${INSTANCE_URL}/p/u/456` })
      );

      const longContent = "a".repeat(600);
      await adapter.publish(
        { content: longContent, mediaType: MediaType.NONE, mediaUrls: [] },
        ACCOUNT_ID,
        TOKEN
      );

      const call = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = call[1].body as FormData;
      const status = body.get("status") as string;
      expect(status).toHaveLength(500);
    });
  });

  describe("publish — image post", () => {
    it("uploads media and attaches media_ids", async () => {
      // First call: fetch image bytes
      mockFetch.mockResolvedValueOnce(
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          headers: new Headers({ "content-type": "image/jpeg" }),
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
          json: () => Promise.resolve({}),
        })
      );
      // Second call: upload media
      mockFetch.mockResolvedValueOnce(
        ok({ id: "media-789", type: "image", url: `${INSTANCE_URL}/storage/media.jpg` })
      );
      // Third call: post status
      mockFetch.mockResolvedValueOnce(
        ok({ id: "status-789", url: `${INSTANCE_URL}/@testuser/789`, uri: `${INSTANCE_URL}/p/t/789` })
      );

      const result = await adapter.publish(
        {
          content: "Check this pic!",
          mediaType: MediaType.IMAGE,
          mediaUrls: ["https://example.com/photo.jpg"],
        },
        ACCOUNT_ID,
        TOKEN
      );

      expect(result.platformPostId).toBe("status-789");
      expect(mockFetch).toHaveBeenCalledTimes(3);
      // Second call (index 1) should be to Pixelfed's v1/media endpoint
      const [uploadUrl] = mockFetch.mock.calls[1] as [string, ...unknown[]];
      expect(uploadUrl).toBe(`${INSTANCE_URL}/api/v1/media`);
    });

    it("throws when image fetch fails", async () => {
      mockFetch.mockResolvedValueOnce(
        Promise.resolve({
          ok: false,
          status: 404,
          statusText: "Not Found",
          headers: new Headers(),
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
          json: () => Promise.resolve({}),
        })
      );

      await expect(
        adapter.publish(
          {
            content: "img post",
            mediaType: MediaType.IMAGE,
            mediaUrls: ["https://example.com/missing.jpg"],
          },
          ACCOUNT_ID,
          TOKEN
        )
      ).rejects.toThrow("Failed to fetch media from URL");
    });

    it("throws when media upload fails", async () => {
      // Fetch image succeeds
      mockFetch.mockResolvedValueOnce(
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          headers: new Headers({ "content-type": "image/jpeg" }),
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
          json: () => Promise.resolve({}),
        })
      );
      // Upload fails
      mockFetch.mockResolvedValueOnce(
        Promise.resolve({
          ok: false,
          status: 422,
          statusText: "Unprocessable Entity",
          headers: new Headers(),
          json: () => Promise.resolve({ error: "Invalid media" }),
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        })
      );

      await expect(
        adapter.publish(
          {
            content: "img post",
            mediaType: MediaType.IMAGE,
            mediaUrls: ["https://example.com/photo.jpg"],
          },
          ACCOUNT_ID,
          TOKEN
        )
      ).rejects.toThrow("Pixelfed media upload error");
    });
  });

  describe("publish — unsupported media types", () => {
    it("throws for VIDEO posts", async () => {
      await expect(
        adapter.publish(
          { content: "video", mediaType: MediaType.VIDEO, mediaUrls: [] },
          ACCOUNT_ID,
          TOKEN
        )
      ).rejects.toThrow("does not support VIDEO");
    });

    it("throws for CAROUSEL posts", async () => {
      await expect(
        adapter.publish(
          { content: "carousel", mediaType: MediaType.CAROUSEL, mediaUrls: [] },
          ACCOUNT_ID,
          TOKEN
        )
      ).rejects.toThrow("does not support CAROUSEL");
    });
  });

  describe("getStatus", () => {
    it("returns PUBLISHED when post exists", async () => {
      mockFetch.mockResolvedValueOnce(
        ok({ id: "status-123", url: `${INSTANCE_URL}/p/t/123`, uri: `${INSTANCE_URL}/p/t/123` })
      );

      const result = await adapter.getStatus("status-123", TOKEN);
      expect(result.status).toBe("PUBLISHED");
    });

    it("returns FAILED when post not found", async () => {
      mockFetch.mockResolvedValueOnce(fail({ error: "Record not found" }, 404));

      const result = await adapter.getStatus("missing-id", TOKEN);
      expect(result.status).toBe("FAILED");
    });
  });

  describe("deletePost", () => {
    it("succeeds when delete returns OK", async () => {
      mockFetch.mockResolvedValueOnce(ok({}));
      await expect(adapter.deletePost("status-123", TOKEN)).resolves.toBeUndefined();
    });

    it("throws when delete fails", async () => {
      mockFetch.mockResolvedValueOnce(fail({ error: "Not found" }, 404));
      await expect(adapter.deletePost("status-bad", TOKEN)).rejects.toThrow(
        "Pixelfed delete failed"
      );
    });
  });

  describe("getInsights", () => {
    it("returns empty insights object", async () => {
      const result = await adapter.getInsights("status-123", TOKEN);
      expect(result).toEqual({});
    });
  });
});
