import { z } from "zod";
import { MediaType } from "@prisma/client";
import {
  PostContent,
  PublishResult,
  PostStatus,
  Insights,
  PlatformAdapter,
} from "./types";

const META_API_BASE = "https://graph.facebook.com/v21.0";

// ── Zod schemas ───────────────────────────────────────────────────────────────

const postIdSchema = z.object({ id: z.string() });

const feedPostResponseSchema = z.object({
  id: z.string(),
  post_id: z.string().optional(),
});

const photoResponseSchema = z.object({
  id: z.string(),
  post_id: z.string().optional(),
});

const videoResponseSchema = z.object({
  id: z.string(),
});

const postStatusSchema = z.object({
  id: z.string(),
  is_published: z.boolean().optional(),
});

const insightsDataSchema = z.object({
  data: z.array(
    z.object({
      name: z.string(),
      values: z.array(z.object({ value: z.union([z.number(), z.record(z.string(), z.number())]) })),
    })
  ),
});

const likeCountSchema = z.object({
  likes: z.object({ summary: z.object({ total_count: z.number() }) }).optional(),
  comments: z.object({ summary: z.object({ total_count: z.number() }) }).optional(),
  shares: z.object({ count: z.number() }).optional(),
});

// ── Internal helpers ──────────────────────────────────────────────────────────

interface MetaErrorBody {
  error?: { message?: string; code?: number };
}

async function fbFetch<T>(
  url: string,
  schema: z.ZodType<T>,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, options);
  const data: unknown = await response.json();

  if (!response.ok) {
    const errorBody = data as MetaErrorBody;
    throw new Error(
      `Facebook API error (${response.status}): ${errorBody.error?.message ?? response.statusText}`
    );
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Facebook API response validation failed: ${parsed.error.message}`
    );
  }

  return parsed.data;
}

async function fbPost<T>(
  path: string,
  token: string,
  schema: z.ZodType<T>,
  body: Record<string, string | number | boolean>
): Promise<T> {
  const params = new URLSearchParams({ access_token: token });
  const url = `${META_API_BASE}/${path}?${params.toString()}`;

  return fbFetch(url, schema, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Facebook Adapter ──────────────────────────────────────────────────────────

export class FacebookAdapter implements PlatformAdapter {
  /**
   * Publish a post to a Facebook Page.
   * Supports text, single image, single video, and carousel (multiple images).
   * If scheduledAt is in the future, uses native FB scheduled publishing.
   */
  async publish(
    post: PostContent,
    pageId: string,
    token: string
  ): Promise<PublishResult> {
    const isScheduled =
      post.scheduledAt != null && post.scheduledAt > new Date();
    const scheduledTimestamp = isScheduled
      ? Math.floor(post.scheduledAt!.getTime() / 1000)
      : undefined;

    let platformPostId: string;
    let publishedUrl: string | undefined;

    switch (post.mediaType) {
      case MediaType.NONE:
        platformPostId = await this.publishTextPost(
          pageId,
          token,
          post.content,
          scheduledTimestamp
        );
        break;

      case MediaType.IMAGE:
        if (post.mediaUrls.length === 0) {
          throw new Error("IMAGE post requires at least one media URL");
        }
        if (post.mediaUrls.length === 1) {
          platformPostId = await this.publishSinglePhoto(
            pageId,
            token,
            post.mediaUrls[0],
            post.content,
            scheduledTimestamp
          );
        } else {
          // Multiple images → carousel
          platformPostId = await this.publishCarousel(
            pageId,
            token,
            post.mediaUrls,
            post.content,
            scheduledTimestamp
          );
        }
        break;

      case MediaType.VIDEO:
        if (post.mediaUrls.length === 0) {
          throw new Error("VIDEO post requires a media URL");
        }
        platformPostId = await this.publishVideo(
          pageId,
          token,
          post.mediaUrls[0],
          post.content,
          scheduledTimestamp
        );
        break;

      case MediaType.CAROUSEL:
        if (post.mediaUrls.length < 2) {
          throw new Error("CAROUSEL post requires at least two media URLs");
        }
        platformPostId = await this.publishCarousel(
          pageId,
          token,
          post.mediaUrls,
          post.content,
          scheduledTimestamp
        );
        break;

      default:
        throw new Error(`Unsupported media type: ${post.mediaType}`);
    }

    if (!isScheduled) {
      publishedUrl = `https://www.facebook.com/${platformPostId}`;
    }

    return {
      platformPostId,
      publishedUrl,
      publishedAt: isScheduled ? post.scheduledAt! : new Date(),
    };
  }

  async getStatus(platformPostId: string, token: string): Promise<PostStatus> {
    const params = new URLSearchParams({
      access_token: token,
      fields: "id,is_published",
    });
    const url = `${META_API_BASE}/${platformPostId}?${params.toString()}`;

    try {
      const data = await fbFetch(url, postStatusSchema);
      return {
        status: data.is_published === false ? "PROCESSING" : "PUBLISHED",
      };
    } catch (err) {
      return {
        status: "FAILED",
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  async deletePost(platformPostId: string, token: string): Promise<void> {
    const params = new URLSearchParams({ access_token: token });
    const url = `${META_API_BASE}/${platformPostId}?${params.toString()}`;

    const response = await fetch(url, { method: "DELETE" });
    if (!response.ok) {
      const data = (await response.json()) as MetaErrorBody;
      throw new Error(
        `Facebook delete error (${response.status}): ${data.error?.message ?? response.statusText}`
      );
    }
  }

  async getInsights(platformPostId: string, token: string): Promise<Insights> {
    // Fetch likes, comments, shares summaries
    const params = new URLSearchParams({
      access_token: token,
      fields:
        "likes.summary(true),comments.summary(true),shares",
    });
    const url = `${META_API_BASE}/${platformPostId}?${params.toString()}`;

    try {
      const data = await fbFetch(url, likeCountSchema);
      return {
        likes: data.likes?.summary.total_count,
        comments: data.comments?.summary.total_count,
        shares: data.shares?.count,
      };
    } catch {
      return {};
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async publishTextPost(
    pageId: string,
    token: string,
    message: string,
    scheduledTimestamp?: number
  ): Promise<string> {
    const body: Record<string, string | number | boolean> = { message };

    if (scheduledTimestamp !== undefined) {
      body.published = false;
      body.scheduled_publish_time = scheduledTimestamp;
    }

    const data = await fbPost(
      `${pageId}/feed`,
      token,
      feedPostResponseSchema,
      body
    );
    return data.post_id ?? data.id;
  }

  private async publishSinglePhoto(
    pageId: string,
    token: string,
    imageUrl: string,
    caption: string,
    scheduledTimestamp?: number
  ): Promise<string> {
    const body: Record<string, string | number | boolean> = {
      url: imageUrl,
      caption,
    };

    if (scheduledTimestamp !== undefined) {
      body.published = false;
      body.scheduled_publish_time = scheduledTimestamp;
    }

    const data = await fbPost(
      `${pageId}/photos`,
      token,
      photoResponseSchema,
      body
    );
    return data.post_id ?? data.id;
  }

  private async publishVideo(
    pageId: string,
    token: string,
    videoUrl: string,
    description: string,
    scheduledTimestamp?: number
  ): Promise<string> {
    const body: Record<string, string | number | boolean> = {
      file_url: videoUrl,
      description,
    };

    if (scheduledTimestamp !== undefined) {
      body.published = false;
      body.scheduled_publish_time = scheduledTimestamp;
    }

    const data = await fbPost(
      `${pageId}/videos`,
      token,
      videoResponseSchema,
      body
    );
    return data.id;
  }

  private async publishCarousel(
    pageId: string,
    token: string,
    imageUrls: string[],
    message: string,
    scheduledTimestamp?: number
  ): Promise<string> {
    // Upload each photo without publishing
    const photoIds = await Promise.all(
      imageUrls.map((url) =>
        fbPost(
          `${pageId}/photos`,
          token,
          postIdSchema,
          { url, published: false }
        ).then((d) => d.id)
      )
    );

    // Create a multi-photo post referencing the uploaded photos
    const body: Record<string, string | number | boolean> = {
      message,
      attached_media: JSON.stringify(
        photoIds.map((id) => ({ media_fbid: id }))
      ),
    };

    if (scheduledTimestamp !== undefined) {
      body.published = false;
      body.scheduled_publish_time = scheduledTimestamp;
    }

    const data = await fbPost(
      `${pageId}/feed`,
      token,
      feedPostResponseSchema,
      body
    );
    return data.post_id ?? data.id;
  }
}

// Export a singleton instance
export const facebookAdapter = new FacebookAdapter();

// Suppress unused import warning — insightsDataSchema kept for future metrics
void insightsDataSchema;
