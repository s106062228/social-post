jest.mock("@prisma/client", () => ({
  MediaType: {
    NONE: "NONE",
    IMAGE: "IMAGE",
    VIDEO: "VIDEO",
    CAROUSEL: "CAROUSEL",
  },
}));

// Mock bluesky-oauth to avoid real network calls
jest.mock("../auth/bluesky-oauth", () => ({
  parseBlueskyToken: (token: string) => JSON.parse(token) as Record<string, string>,
  refreshBlueskySession: jest.fn(),
  serializeBlueskyToken: (data: unknown) => JSON.stringify(data),
}));

import { BlueskyAdapter } from "../platforms/bluesky";
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

const DID = "did:plc:testuser123";
const HANDLE = "testuser.bsky.social";
const ACCESS_JWT = "eyJtest_access_jwt";
const REFRESH_JWT = "eyJtest_refresh_jwt";
const AT_URI = `at://${DID}/app.bsky.feed.post/3kexample`;
const RKEY = "3kexample";

const TOKEN = JSON.stringify({
  did: DID,
  handle: HANDLE,
  accessJwt: ACCESS_JWT,
  refreshJwt: REFRESH_JWT,
});

describe("BlueskyAdapter", () => {
  let adapter: BlueskyAdapter;

  beforeEach(() => {
    adapter = new BlueskyAdapter();
  });

  // ── publish – NONE (text-only) ─────────────────────────────────────────────

  describe("publish – NONE (text-only)", () => {
    it("creates a post record and returns AT URI + published URL", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ uri: AT_URI, cid: "bafytest" })
      );

      const result = await adapter.publish(
        { content: "Hello Bluesky!", mediaType: MediaType.NONE, mediaUrls: [] },
        DID,
        TOKEN
      );

      expect(result.platformPostId).toBe(AT_URI);
      expect(result.publishedUrl).toBe(
        `https://bsky.app/profile/${HANDLE}/post/${RKEY}`
      );
      expect(result.publishedAt).toBeInstanceOf(Date);

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("com.atproto.repo.createRecord");
      expect(options.method).toBe("POST");
      expect(
        (options.headers as Record<string, string>)["Authorization"]
      ).toBe(`Bearer ${ACCESS_JWT}`);

      const body = JSON.parse(options.body as string) as {
        record: { text: string; $type: string };
      };
      expect(body.record.text).toBe("Hello Bluesky!");
      expect(body.record.$type).toBe("app.bsky.feed.post");
    });

    it("truncates content to 300 characters", async () => {
      mockFetch.mockReturnValueOnce(ok({ uri: AT_URI, cid: "bafytest" }));

      const longContent = "A".repeat(500);
      await adapter.publish(
        { content: longContent, mediaType: MediaType.NONE, mediaUrls: [] },
        DID,
        TOKEN
      );

      const body = JSON.parse(
        (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string
      ) as { record: { text: string } };
      expect(body.record.text.length).toBe(300);
    });
  });

  // ── publish – IMAGE ────────────────────────────────────────────────────────

  describe("publish – IMAGE", () => {
    it("uploads blob and embeds image in post", async () => {
      // First call: fetch the image
      mockFetch.mockReturnValueOnce(
        ok(null, 200)
      );
      // Second call: upload blob
      mockFetch.mockReturnValueOnce(
        ok({
          blob: {
            $type: "blob",
            ref: { $link: "bafyimage" },
            mimeType: "image/jpeg",
            size: 1024,
          },
        })
      );
      // Third call: create record
      mockFetch.mockReturnValueOnce(ok({ uri: AT_URI, cid: "bafytest" }));

      const result = await adapter.publish(
        {
          content: "Image post!",
          mediaType: MediaType.IMAGE,
          mediaUrls: ["https://example.com/image.jpg"],
        },
        DID,
        TOKEN
      );

      expect(result.platformPostId).toBe(AT_URI);
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // Verify the create record call includes an embed
      const createCallBody = JSON.parse(
        (mockFetch.mock.calls[2] as [string, RequestInit])[1].body as string
      ) as { record: { embed?: { $type: string } } };
      expect(createCallBody.record.embed?.$type).toBe("app.bsky.embed.images");
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
          DID,
          TOKEN
        )
      ).rejects.toThrow("Failed to fetch media from URL");
    });

    it("throws when blob upload fails", async () => {
      mockFetch.mockReturnValueOnce(ok(null, 200));
      mockFetch.mockReturnValueOnce(fail({ error: "Upload failed" }, 500));

      await expect(
        adapter.publish(
          {
            content: "Image post!",
            mediaType: MediaType.IMAGE,
            mediaUrls: ["https://example.com/image.jpg"],
          },
          DID,
          TOKEN
        )
      ).rejects.toThrow("Bluesky blob upload error");
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
          DID,
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
          DID,
          TOKEN
        )
      ).rejects.toThrow("does not support CAROUSEL");
    });
  });

  // ── getStatus ──────────────────────────────────────────────────────────────

  describe("getStatus", () => {
    it("returns PUBLISHED when record exists", async () => {
      mockFetch.mockReturnValueOnce(
        ok({ uri: AT_URI, cid: "bafytest", value: {} })
      );

      const status = await adapter.getStatus(AT_URI, TOKEN);
      expect(status.status).toBe("PUBLISHED");
    });

    it("returns FAILED when record is not found", async () => {
      mockFetch.mockReturnValueOnce(
        fail({ error: "RecordNotFound" }, 400)
      );

      const status = await adapter.getStatus(AT_URI, TOKEN);
      expect(status.status).toBe("FAILED");
      expect(status.error).toBeTruthy();
    });
  });

  // ── deletePost ─────────────────────────────────────────────────────────────

  describe("deletePost", () => {
    it("calls deleteRecord with correct repo/collection/rkey", async () => {
      mockFetch.mockReturnValueOnce(ok({}));

      await adapter.deletePost(AT_URI, TOKEN);

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("com.atproto.repo.deleteRecord");
      expect(options.method).toBe("POST");

      const body = JSON.parse(options.body as string) as {
        repo: string;
        collection: string;
        rkey: string;
      };
      expect(body.repo).toBe(DID);
      expect(body.collection).toBe("app.bsky.feed.post");
      expect(body.rkey).toBe(RKEY);
    });
  });

  // ── getInsights ────────────────────────────────────────────────────────────

  describe("getInsights", () => {
    it("returns empty insights object (Bluesky has no metrics API)", async () => {
      const insights = await adapter.getInsights(AT_URI, TOKEN);
      expect(insights).toEqual({});
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
