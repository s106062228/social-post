import { z } from "zod";
import { MediaType } from "@prisma/client";
import {
  PostContent,
  PublishResult,
  PostStatus,
  Insights,
  PlatformAdapter,
} from "./types";

const TWITTER_API_BASE = "https://api.twitter.com/2";
const TWITTER_UPLOAD_URL = "https://upload.twitter.com/1.1/media/upload.json";

// ── Zod schemas ───────────────────────────────────────────────────────────────

const createTweetResponseSchema = z.object({
  data: z.object({
    id: z.string(),
    text: z.string(),
  }),
});

const tweetLookupResponseSchema = z.object({
  data: z
    .object({
      id: z.string(),
      text: z.string(),
    })
    .optional(),
  errors: z
    .array(
      z.object({
        title: z.string(),
        detail: z.string().optional(),
      })
    )
    .optional(),
});

const mediaUploadResponseSchema = z.object({
  media_id_string: z.string(),
});

const tweetMetricsResponseSchema = z.object({
  data: z
    .object({
      id: z.string(),
      public_metrics: z
        .object({
          retweet_count: z.number().optional(),
          reply_count: z.number().optional(),
          like_count: z.number().optional(),
          impression_count: z.number().optional(),
        })
        .optional(),
    })
    .optional(),
});

// ── Internal helpers ──────────────────────────────────────────────────────────

interface TwitterErrorBody {
  title?: string;
  detail?: string;
  errors?: Array<{ message?: string }>;
}

async function twitterApiFetch<T>(
  url: string,
  schema: z.ZodType<T>,
  token: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });

  const data: unknown = await response.json();

  if (!response.ok) {
    const err = data as TwitterErrorBody;
    const msg =
      err.detail ??
      err.errors?.[0]?.message ??
      err.title ??
      response.statusText;
    throw new Error(`Twitter API error (${response.status}): ${msg}`);
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Twitter API response validation failed: ${parsed.error.message}`
    );
  }

  return parsed.data;
}

// ── Twitter Adapter ───────────────────────────────────────────────────────────

export class TwitterAdapter implements PlatformAdapter {
  /**
   * Publish a tweet to Twitter/X via the Twitter API v2.
   * Supports NONE (text-only) and IMAGE (single image) posts.
   */
  async publish(
    post: PostContent,
    _accountId: string,
    token: string
  ): Promise<PublishResult> {
    if (
      post.mediaType !== MediaType.NONE &&
      post.mediaType !== MediaType.IMAGE
    ) {
      throw new Error(
        `Twitter adapter supports NONE and IMAGE posts, got ${post.mediaType}`
      );
    }

    // Trim to Twitter's 280-character limit
    const text = post.content.slice(0, 280);

    let mediaId: string | undefined;

    if (post.mediaType === MediaType.IMAGE && post.mediaUrls.length > 0) {
      mediaId = await this.uploadMedia(token, post.mediaUrls[0]);
      const altText = post.altTexts?.[0];
      if (altText && mediaId) {
        await this.setMediaAltText(token, mediaId, altText);
      }
    }

    const body: Record<string, unknown> = { text };
    if (mediaId) {
      body.media = { media_ids: [mediaId] };
    }

    const result = await twitterApiFetch(
      `${TWITTER_API_BASE}/tweets`,
      createTweetResponseSchema,
      token,
      { method: "POST", body: JSON.stringify(body) }
    );

    const tweetId = result.data.id;

    return {
      platformPostId: tweetId,
      publishedAt: new Date(),
      publishedUrl: `https://twitter.com/i/web/status/${tweetId}`,
    };
  }

  async getStatus(platformPostId: string, token: string): Promise<PostStatus> {
    try {
      const response = await twitterApiFetch(
        `${TWITTER_API_BASE}/tweets/${platformPostId}`,
        tweetLookupResponseSchema,
        token
      );

      if (response.data) {
        return { status: "PUBLISHED" };
      }

      return { status: "FAILED", error: "Tweet not found" };
    } catch (err) {
      return {
        status: "FAILED",
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  async deletePost(platformPostId: string, token: string): Promise<void> {
    const response = await fetch(
      `${TWITTER_API_BASE}/tweets/${platformPostId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    // 404 = already deleted, treat as success
    if (!response.ok && response.status !== 404) {
      let message = response.statusText;
      try {
        const body = (await response.json()) as TwitterErrorBody;
        message = body.detail ?? body.title ?? message;
      } catch {
        // ignore parse error
      }
      throw new Error(
        `Twitter delete error (${response.status}): ${message}`
      );
    }
  }

  async getInsights(
    platformPostId: string,
    token: string
  ): Promise<Insights> {
    try {
      const response = await twitterApiFetch(
        `${TWITTER_API_BASE}/tweets/${platformPostId}?tweet.fields=public_metrics`,
        tweetMetricsResponseSchema,
        token
      );

      const metrics = response.data?.public_metrics;
      if (!metrics) return {};

      return {
        impressions: metrics.impression_count,
        likes: metrics.like_count,
        comments: metrics.reply_count,
        shares: metrics.retweet_count,
      };
    } catch {
      return {};
    }
  }

  async addComment(
    platformPostId: string,
    comment: string,
    token: string
  ): Promise<void> {
    const text = comment.slice(0, 280);
    await twitterApiFetch(
      `${TWITTER_API_BASE}/tweets`,
      createTweetResponseSchema,
      token,
      {
        method: "POST",
        body: JSON.stringify({
          text,
          reply: { in_reply_to_tweet_id: platformPostId },
        }),
      }
    );
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async uploadMedia(
    token: string,
    mediaUrl: string
  ): Promise<string> {
    // Fetch the image from the CDN URL
    const imageResponse = await fetch(mediaUrl);
    if (!imageResponse.ok) {
      throw new Error(
        `Failed to fetch media from URL: ${imageResponse.statusText}`
      );
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString("base64");
    const mimeType =
      imageResponse.headers.get("content-type") ?? "image/jpeg";

    // Upload via v1.1 media upload endpoint (still required for media uploads)
    const formBody = new URLSearchParams({
      media_data: base64Image,
      media_type: mimeType,
    });

    const uploadResponse = await fetch(TWITTER_UPLOAD_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody.toString(),
    });

    if (!uploadResponse.ok) {
      let msg = uploadResponse.statusText;
      try {
        const body = (await uploadResponse.json()) as TwitterErrorBody;
        msg = body.detail ?? body.title ?? msg;
      } catch {
        // ignore
      }
      throw new Error(
        `Twitter media upload error (${uploadResponse.status}): ${msg}`
      );
    }

    const uploadData: unknown = await uploadResponse.json();
    const parsed = mediaUploadResponseSchema.safeParse(uploadData);
    if (!parsed.success) {
      throw new Error("Twitter media upload response validation failed");
    }

    return parsed.data.media_id_string;
  }

  private async setMediaAltText(
    token: string,
    mediaId: string,
    altText: string
  ): Promise<void> {
    const TWITTER_METADATA_URL =
      "https://upload.twitter.com/1.1/media/metadata/create.json";

    const response = await fetch(TWITTER_METADATA_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        media_id: mediaId,
        alt_text: { text: altText.slice(0, 1000) },
      }),
    });

    // 204 No Content is success; non-2xx is a warning (do not fail the publish)
    if (!response.ok && response.status !== 204) {
      console.warn(`Twitter alt text upload failed (${response.status})`);
    }
  }
}

export const twitterAdapter = new TwitterAdapter();
