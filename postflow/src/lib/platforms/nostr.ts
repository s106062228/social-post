import { MediaType } from "@prisma/client";
import { finalizeEvent } from "nostr-tools/pure";
import { SimplePool } from "nostr-tools/pool";
import {
  PostContent,
  PublishResult,
  PostStatus,
  Insights,
  PlatformAdapter,
} from "./types";
import {
  parseNostrToken,
  hexPrivateKeyToBytes,
} from "@/lib/auth/nostr-oauth";

const NOSTR_CHAR_LIMIT = 4096;
// Kind 1 = short text note (most common post type)
const KIND_TEXT_NOTE = 1;
// Kind 5 = deletion request
const KIND_DELETION = 5;
// How long to wait for at least one relay to accept the event
const RELAY_TIMEOUT_MS = 10_000;

// ── Internal helpers ──────────────────────────────────────────────────────────

async function publishToRelays(
  privateKeyBytes: Uint8Array,
  relayUrls: string[],
  content: string,
  tags: string[][] = []
): Promise<string> {
  const event = finalizeEvent(
    {
      kind: KIND_TEXT_NOTE,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content,
    },
    privateKeyBytes
  );

  const pool = new SimplePool();

  try {
    const publishPromises = pool.publish(relayUrls, event);

    // Race: succeed if at least one relay accepts within the timeout
    await Promise.race([
      Promise.any(publishPromises).catch(() => {
        throw new Error("All relays rejected the event");
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Relay publish timeout")),
          RELAY_TIMEOUT_MS
        )
      ),
    ]);

    return event.id;
  } finally {
    pool.close(relayUrls);
  }
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class NostrAdapter implements PlatformAdapter {
  async publish(
    post: PostContent,
    _accountId: string,
    token: string
  ): Promise<PublishResult> {
    const { privateKey, relayUrls } = parseNostrToken(token);
    const privateKeyBytes = hexPrivateKeyToBytes(privateKey);

    if (post.mediaType === MediaType.VIDEO || post.mediaType === MediaType.CAROUSEL) {
      throw new Error(
        `Nostr adapter does not support ${post.mediaType} posts`
      );
    }

    let content = post.content.slice(0, NOSTR_CHAR_LIMIT);

    // For image posts, embed image URLs in the content and add imeta tags
    const tags: string[][] = [];
    if (post.mediaType === MediaType.IMAGE && post.mediaUrls.length > 0) {
      const imageUrls = post.mediaUrls.slice(0, 4);
      // Append image URLs to content if not already present
      const urlsToAppend = imageUrls.filter((u) => !content.includes(u));
      if (urlsToAppend.length > 0) {
        const urlSection = "\n\n" + urlsToAppend.join("\n");
        content = content.slice(0, NOSTR_CHAR_LIMIT - urlSection.length) + urlSection;
      }
      // Add imeta tags per NIP-92 for media metadata
      for (const url of imageUrls) {
        tags.push(["url", url]);
      }
    }

    const eventId = await publishToRelays(privateKeyBytes, relayUrls, content, tags);

    return {
      platformPostId: eventId,
      publishedAt: new Date(),
    };
  }

  async getStatus(
    platformPostId: string,
    token: string
  ): Promise<PostStatus> {
    const { relayUrls } = parseNostrToken(token);
    const pool = new SimplePool();

    try {
      const event = await Promise.race([
        pool.get(relayUrls, { ids: [platformPostId] }),
        new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), RELAY_TIMEOUT_MS)
        ),
      ]);

      if (event) {
        return { status: "PUBLISHED" };
      }
      // Event not found on relays — may have been deleted or not propagated
      return { status: "PUBLISHED" }; // Optimistically assume published
    } catch {
      return { status: "FAILED", error: "Could not query relays" };
    } finally {
      pool.close(relayUrls);
    }
  }

  async deletePost(platformPostId: string, token: string): Promise<void> {
    const { privateKey, relayUrls } = parseNostrToken(token);
    const privateKeyBytes = hexPrivateKeyToBytes(privateKey);

    // NIP-09: Publish a kind-5 deletion request event (pubkey derived by finalizeEvent)
    const deletionEvent = finalizeEvent(
      {
        kind: KIND_DELETION,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["e", platformPostId], ["k", String(KIND_TEXT_NOTE)]],
        content: "deleted",
      },
      privateKeyBytes
    );

    const pool = new SimplePool();
    try {
      const publishPromises = pool.publish(relayUrls, deletionEvent);
      await Promise.race([
        Promise.any(publishPromises).catch(() => {
          throw new Error("Could not send deletion request to any relay");
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Relay deletion timeout")),
            RELAY_TIMEOUT_MS
          )
        ),
      ]);
    } finally {
      pool.close(relayUrls);
    }
  }

  async getInsights(
    _platformPostId: string,
    _token: string
  ): Promise<Insights> {
    // Nostr does not expose engagement analytics via a standard API
    return {};
  }
}

export const nostrAdapter = new NostrAdapter();
