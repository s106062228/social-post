import { z } from "zod";
import { MediaType } from "@prisma/client";
import {
  PostContent,
  PublishResult,
  PostStatus,
  Insights,
  PlatformAdapter,
} from "./types";
import { parseBlueskyToken } from "@/lib/auth/bluesky-oauth";

const BSKY_XRPC_BASE = "https://bsky.social/xrpc";

// ── Zod schemas ───────────────────────────────────────────────────────────────

const createRecordResponseSchema = z.object({
  uri: z.string(),
  cid: z.string(),
});

const getRecordResponseSchema = z.object({
  uri: z.string(),
  cid: z.string(),
  value: z.record(z.unknown()),
});

const uploadBlobResponseSchema = z.object({
  blob: z.object({
    $type: z.literal("blob"),
    ref: z.object({ $link: z.string() }),
    mimeType: z.string(),
    size: z.number(),
  }),
});

type BlobRef = z.infer<typeof uploadBlobResponseSchema>["blob"];

// ── Internal helpers ──────────────────────────────────────────────────────────

interface BskyErrorBody {
  error?: string;
  message?: string;
}

async function bskyApiFetch<T>(
  path: string,
  schema: z.ZodType<T>,
  accessJwt: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${BSKY_XRPC_BASE}/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessJwt}`,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });

  const data: unknown = await response.json();

  if (!response.ok) {
    const err = data as BskyErrorBody;
    throw new Error(
      `Bluesky API error (${response.status}): ${err.message ?? err.error ?? response.statusText}`
    );
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Bluesky API response validation failed: ${parsed.error.message}`
    );
  }

  return parsed.data;
}

/** Extracts the rkey from an AT URI (at://did:.../collection/rkey) */
function rkeyFromUri(uri: string): string {
  const parts = uri.split("/");
  return parts[parts.length - 1] ?? uri;
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class BlueskyAdapter implements PlatformAdapter {
  async publish(
    post: PostContent,
    _accountId: string,
    token: string
  ): Promise<PublishResult> {
    const { did, accessJwt } = parseBlueskyToken(token);

    const now = new Date().toISOString();
    const text = post.content.slice(0, 300);

    // Build the record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const record: Record<string, any> = {
      $type: "app.bsky.feed.post",
      text,
      createdAt: now,
    };

    if (
      post.mediaType === MediaType.IMAGE &&
      post.mediaUrls.length > 0
    ) {
      const images = await Promise.all(
        post.mediaUrls.slice(0, 4).map((url) =>
          this.uploadImage(accessJwt, url)
        )
      );

      record["embed"] = {
        $type: "app.bsky.embed.images",
        images: images.map((img: BlobRef) => ({
          image: img,
          alt: "",
        })),
      };
    } else if (
      (post.mediaType === MediaType.VIDEO ||
        post.mediaType === MediaType.CAROUSEL) &&
      post.mediaUrls.length > 0
    ) {
      throw new Error(
        `Bluesky does not support ${post.mediaType} posts via this adapter`
      );
    }

    const result = await bskyApiFetch(
      "com.atproto.repo.createRecord",
      createRecordResponseSchema,
      accessJwt,
      {
        method: "POST",
        body: JSON.stringify({
          repo: did,
          collection: "app.bsky.feed.post",
          record,
        }),
      }
    );

    const rkey = rkeyFromUri(result.uri);
    const handle = parseBlueskyToken(token).handle;

    return {
      platformPostId: result.uri,
      publishedUrl: `https://bsky.app/profile/${handle}/post/${rkey}`,
      publishedAt: new Date(),
    };
  }

  async getStatus(
    platformPostId: string,
    token: string
  ): Promise<PostStatus> {
    const { did, accessJwt } = parseBlueskyToken(token);
    const rkey = rkeyFromUri(platformPostId);

    try {
      await bskyApiFetch(
        `com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=app.bsky.feed.post&rkey=${encodeURIComponent(rkey)}`,
        getRecordResponseSchema,
        accessJwt
      );
      return { status: "PUBLISHED" };
    } catch {
      return { status: "FAILED", error: "Post not found" };
    }
  }

  async deletePost(platformPostId: string, token: string): Promise<void> {
    const { did, accessJwt } = parseBlueskyToken(token);
    const rkey = rkeyFromUri(platformPostId);

    await bskyApiFetch(
      "com.atproto.repo.deleteRecord",
      z.object({}),
      accessJwt,
      {
        method: "POST",
        body: JSON.stringify({
          repo: did,
          collection: "app.bsky.feed.post",
          rkey,
        }),
      }
    );
  }

  async getInsights(
    _platformPostId: string,
    _token: string
  ): Promise<Insights> {
    // Bluesky does not expose engagement metrics via public API
    return {};
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async uploadImage(
    accessJwt: string,
    imageUrl: string
  ): Promise<BlobRef> {
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(
        `Failed to fetch media from URL: ${imageResponse.statusText}`
      );
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const mimeType =
      imageResponse.headers.get("content-type") ?? "image/jpeg";

    const uploadResponse = await fetch(
      `${BSKY_XRPC_BASE}/com.atproto.repo.uploadBlob`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessJwt}`,
          "Content-Type": mimeType,
        },
        body: imageBuffer,
      }
    );

    if (!uploadResponse.ok) {
      let msg = uploadResponse.statusText;
      try {
        const body = (await uploadResponse.json()) as BskyErrorBody;
        msg = body.message ?? body.error ?? msg;
      } catch {
        // ignore
      }
      throw new Error(`Bluesky blob upload error (${uploadResponse.status}): ${msg}`);
    }

    const uploadData: unknown = await uploadResponse.json();
    const parsed = uploadBlobResponseSchema.safeParse(uploadData);
    if (!parsed.success) {
      throw new Error("Bluesky blob upload response validation failed");
    }

    return parsed.data.blob;
  }
}

export const blueskyAdapter = new BlueskyAdapter();
