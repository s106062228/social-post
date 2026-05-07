jest.mock("@prisma/client", () => ({
  MediaType: {
    NONE: "NONE",
    IMAGE: "IMAGE",
    VIDEO: "VIDEO",
    CAROUSEL: "CAROUSEL",
  },
}));

// Mock nostr-tools/pure — return a deterministic fake event
const mockFinalizeEvent = jest.fn();
const mockGetPublicKey = jest.fn();
jest.mock("nostr-tools/pure", () => ({
  finalizeEvent: (template: unknown, _key: Uint8Array) => mockFinalizeEvent(template),
  getPublicKey: (key: Uint8Array) => mockGetPublicKey(key),
}));

// Mock nostr-tools/nip19
jest.mock("nostr-tools/nip19", () => ({
  decode: (input: string) => {
    if (input.startsWith("nsec1")) {
      return { type: "nsec", data: new Uint8Array(32).fill(1) };
    }
    throw new Error("invalid nsec");
  },
}));

// Mock nostr-tools/pool — controllable SimplePool
const mockPublish = jest.fn();
const mockGet = jest.fn();
const mockClose = jest.fn();
jest.mock("nostr-tools/pool", () => ({
  SimplePool: jest.fn().mockImplementation(() => ({
    publish: mockPublish,
    get: mockGet,
    close: mockClose,
  })),
}));

// Mock nostr-oauth module so parseNostrToken works without real encryption
jest.mock("../auth/nostr-oauth", () => ({
  parseNostrToken: (raw: string) => JSON.parse(raw),
  hexPrivateKeyToBytes: (hex: string) => {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  },
  verifyNostrPrivateKey: (key: string) => {
    if (key === "invalid") throw new Error("Invalid private key format");
    return { privateKey: "a".repeat(64), publicKey: "pub" + "b".repeat(60) };
  },
  serializeNostrToken: (data: unknown) => JSON.stringify(data),
}));

import { NostrAdapter } from "../platforms/nostr";
import { MediaType } from "@prisma/client";

const RELAY_URLS = ["wss://relay.damus.io", "wss://nos.lol"];
const PRIVATE_KEY_HEX = "a".repeat(64);
const PUBLIC_KEY_HEX = "b".repeat(64);
const TOKEN = JSON.stringify({
  privateKey: PRIVATE_KEY_HEX,
  publicKey: PUBLIC_KEY_HEX,
  relayUrls: RELAY_URLS,
});

const FAKE_EVENT_ID = "deadbeef".repeat(8);
const FAKE_EVENT = { id: FAKE_EVENT_ID, kind: 1, content: "test", tags: [] };

beforeEach(() => {
  mockFinalizeEvent.mockReset();
  mockGet.mockReset();
  mockPublish.mockReset();
  mockClose.mockReset();
  // Default: finalizeEvent returns a fake signed event
  mockFinalizeEvent.mockReturnValue(FAKE_EVENT);
  // Default: publish resolves immediately for all relays
  mockPublish.mockReturnValue([Promise.resolve("ok")]);
  // Default: get returns the event
  mockGet.mockResolvedValue(FAKE_EVENT);
});

describe("NostrAdapter", () => {
  let adapter: NostrAdapter;

  beforeEach(() => {
    adapter = new NostrAdapter();
  });

  // ── publish – NONE (text post) ─────────────────────────────────────────────

  describe("publish – NONE (text post)", () => {
    it("creates a kind-1 event and returns platformPostId", async () => {
      const result = await adapter.publish(
        { content: "Hello Nostr!", mediaType: MediaType.NONE, mediaUrls: [] },
        PUBLIC_KEY_HEX,
        TOKEN
      );

      expect(result.platformPostId).toBe(FAKE_EVENT_ID);
      expect(result.publishedAt).toBeInstanceOf(Date);
      expect(mockFinalizeEvent).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 1, content: "Hello Nostr!" })
      );
      expect(mockPublish).toHaveBeenCalledWith(RELAY_URLS, FAKE_EVENT);
    });

    it("truncates content to 4096 characters", async () => {
      const longContent = "x".repeat(5000);

      await adapter.publish(
        { content: longContent, mediaType: MediaType.NONE, mediaUrls: [] },
        PUBLIC_KEY_HEX,
        TOKEN
      );

      const call = mockFinalizeEvent.mock.calls[0][0] as { content: string };
      expect(call.content.length).toBeLessThanOrEqual(4096);
    });
  });

  // ── publish – IMAGE ────────────────────────────────────────────────────────

  describe("publish – IMAGE (image post)", () => {
    it("appends image URLs to content and adds url tags", async () => {
      const imageUrl = "https://cdn.example.com/photo.jpg";

      await adapter.publish(
        {
          content: "Look at this photo!",
          mediaType: MediaType.IMAGE,
          mediaUrls: [imageUrl],
        },
        PUBLIC_KEY_HEX,
        TOKEN
      );

      const call = mockFinalizeEvent.mock.calls[0][0] as {
        content: string;
        tags: string[][];
      };
      expect(call.content).toContain(imageUrl);
      expect(call.tags).toContainEqual(["url", imageUrl]);
    });

    it("does not duplicate URL in content if already present", async () => {
      const imageUrl = "https://cdn.example.com/photo.jpg";

      await adapter.publish(
        {
          content: `Check https://cdn.example.com/photo.jpg out`,
          mediaType: MediaType.IMAGE,
          mediaUrls: [imageUrl],
        },
        PUBLIC_KEY_HEX,
        TOKEN
      );

      const call = mockFinalizeEvent.mock.calls[0][0] as { content: string };
      const occurrences = (call.content.match(/photo\.jpg/g) ?? []).length;
      expect(occurrences).toBe(1);
    });

    it("caps images at 4", async () => {
      const urls = Array.from({ length: 6 }, (_, i) => `https://cdn.example.com/img${i}.jpg`);

      await adapter.publish(
        { content: "Gallery", mediaType: MediaType.IMAGE, mediaUrls: urls },
        PUBLIC_KEY_HEX,
        TOKEN
      );

      const call = mockFinalizeEvent.mock.calls[0][0] as { tags: string[][] };
      const urlTags = call.tags.filter((t) => t[0] === "url");
      expect(urlTags.length).toBeLessThanOrEqual(4);
    });
  });

  // ── publish – unsupported types ────────────────────────────────────────────

  describe("publish – unsupported media types", () => {
    it("throws for VIDEO", async () => {
      await expect(
        adapter.publish(
          { content: "video", mediaType: MediaType.VIDEO, mediaUrls: ["https://example.com/v.mp4"] },
          PUBLIC_KEY_HEX,
          TOKEN
        )
      ).rejects.toThrow("VIDEO");
    });

    it("throws for CAROUSEL", async () => {
      await expect(
        adapter.publish(
          { content: "carousel", mediaType: MediaType.CAROUSEL, mediaUrls: [] },
          PUBLIC_KEY_HEX,
          TOKEN
        )
      ).rejects.toThrow("CAROUSEL");
    });
  });

  // ── publish – relay failure ────────────────────────────────────────────────

  describe("publish – relay failure", () => {
    it("throws when all relays reject", async () => {
      mockPublish.mockReturnValue([
        Promise.reject(new Error("relay refused")),
        Promise.reject(new Error("relay refused")),
      ]);

      await expect(
        adapter.publish(
          { content: "test", mediaType: MediaType.NONE, mediaUrls: [] },
          PUBLIC_KEY_HEX,
          TOKEN
        )
      ).rejects.toThrow("All relays rejected");
    });
  });

  // ── getStatus ──────────────────────────────────────────────────────────────

  describe("getStatus", () => {
    it("returns PUBLISHED when event is found on relay", async () => {
      mockGet.mockResolvedValue(FAKE_EVENT);

      const status = await adapter.getStatus(FAKE_EVENT_ID, TOKEN);
      expect(status.status).toBe("PUBLISHED");
    });

    it("returns PUBLISHED optimistically when event not found (may have propagated)", async () => {
      mockGet.mockResolvedValue(null);

      const status = await adapter.getStatus(FAKE_EVENT_ID, TOKEN);
      expect(status.status).toBe("PUBLISHED");
    });

    it("returns FAILED when relay query throws", async () => {
      mockGet.mockRejectedValue(new Error("relay connection failed"));

      const status = await adapter.getStatus(FAKE_EVENT_ID, TOKEN);
      expect(status.status).toBe("FAILED");
    });
  });

  // ── deletePost ─────────────────────────────────────────────────────────────

  describe("deletePost", () => {
    it("publishes a kind-5 deletion event", async () => {
      const deletionEvent = { id: "del123", kind: 5, tags: [["e", FAKE_EVENT_ID]] };
      mockFinalizeEvent.mockReturnValue(deletionEvent);
      mockPublish.mockReturnValue([Promise.resolve("ok")]);

      await expect(adapter.deletePost(FAKE_EVENT_ID, TOKEN)).resolves.toBeUndefined();

      const call = mockFinalizeEvent.mock.calls[0][0] as { kind: number; tags: string[][] };
      expect(call.kind).toBe(5);
      expect(call.tags).toContainEqual(["e", FAKE_EVENT_ID]);
    });

    it("throws when deletion event cannot be sent to any relay", async () => {
      mockFinalizeEvent.mockReturnValue({ id: "del123", kind: 5, tags: [] });
      mockPublish.mockReturnValue([Promise.reject(new Error("refused"))]);

      await expect(adapter.deletePost(FAKE_EVENT_ID, TOKEN)).rejects.toThrow();
    });
  });

  // ── getInsights ────────────────────────────────────────────────────────────

  describe("getInsights", () => {
    it("returns empty object (Nostr has no analytics API)", async () => {
      const insights = await adapter.getInsights(FAKE_EVENT_ID, TOKEN);
      expect(insights).toEqual({});
    });
  });
});
