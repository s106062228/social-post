import { z } from "zod";
import { MediaType } from "@prisma/client";
import {
  PostContent,
  PublishResult,
  PostStatus,
  Insights,
  PlatformAdapter,
} from "./types";

const TIKTOK_API_BASE = "https://open.tiktokapis.com/v2";

// ── Zod schemas ───────────────────────────────────────────────────────────────

const publishInitResponseSchema = z.object({
  data: z.object({
    publish_id: z.string(),
    upload_url: z.string().optional(),
  }),
  error: z
    .object({
      code: z.string().optional(),
      message: z.string().optional(),
    })
    .optional(),
});

const publishStatusResponseSchema = z.object({
  data: z.object({
    status: z.string(),
    fail_reason: z.string().optional(),
    publicaly_available_post_id: z.array(z.string()).optional(),
  }),
  error: z
    .object({
      code: z.string().optional(),
      message: z.string().optional(),
    })
    .optional(),
});

const videoQueryResponseSchema = z.object({
  data: z
    .object({
      videos: z
        .array(
          z.object({
            id: z.string(),
            like_count: z.number().optional(),
            comment_count: z.number().optional(),
            share_count: z.number().optional(),
            view_count: z.number().optional(),
          })
        )
        .optional(),
    })
    .optional(),
});

// ── Internal helpers ──────────────────────────────────────────────────────────

interface TikTokErrorBody {
  error?: {
    code?: string;
    message?: string;
    log_id?: string;
  };
}

async function tikTokApiFetch<T>(
  url: string,
  schema: z.ZodType<T>,
  token: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      ...(options?.headers ?? {}),
    },
  });

  const data: unknown = await response.json();

  if (!response.ok) {
    const err = data as TikTokErrorBody;
    const msg =
      err.error?.message ?? response.statusText;
    throw new Error(`TikTok API error (${response.status}): ${msg}`);
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `TikTok API response validation failed: ${parsed.error.message}`
    );
  }

  return parsed.data;
}

// ── TikTok Adapter ────────────────────────────────────────────────────────────

export class TikTokAdapter implements PlatformAdapter {
  /**
   * Publish a video to TikTok via the Content Posting API.
   * Only VIDEO posts with at least one media URL are supported.
   * The mediaUrl must be a publicly accessible video file URL.
   */
  async publish(
    post: PostContent,
    _openId: string,
    token: string
  ): Promise<PublishResult> {
    if (post.mediaType !== MediaType.VIDEO) {
      throw new Error(
        `TikTok adapter only supports VIDEO posts, got ${post.mediaType}`
      );
    }

    if (post.mediaUrls.length === 0) {
      throw new Error("VIDEO post requires at least one media URL");
    }

    const videoUrl = post.mediaUrls[0];

    // Use PULL_FROM_URL source — TikTok downloads the video from our CDN URL
    const publishId = await this.initVideoPublish(token, videoUrl, post.content);

    return {
      platformPostId: publishId,
      publishedAt: new Date(),
    };
  }

  async getStatus(platformPostId: string, token: string): Promise<PostStatus> {
    const url = `${TIKTOK_API_BASE}/post/publish/status/fetch/?publish_id=${encodeURIComponent(platformPostId)}`;

    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        return { status: "FAILED", error: `HTTP ${response.status}` };
      }

      const parsed = publishStatusResponseSchema.safeParse(
        await response.json()
      );
      if (!parsed.success) {
        return { status: "FAILED", error: "Invalid status response" };
      }

      const status = parsed.data.data.status;

      if (status === "PUBLISHED") {
        const postId =
          parsed.data.data.publicaly_available_post_id?.[0] ?? platformPostId;
        return {
          status: "PUBLISHED",
          platformPostId: postId,
          publishedUrl: `https://www.tiktok.com/@user/video/${postId}`,
        };
      }
      if (status === "FAILED") {
        return {
          status: "FAILED",
          error: parsed.data.data.fail_reason ?? "Publish failed",
        };
      }

      return { status: "PROCESSING" };
    } catch (err) {
      return {
        status: "FAILED",
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  async deletePost(platformPostId: string, token: string): Promise<void> {
    // TikTok Content Posting API does not support video deletion via the API
    // Log a warning and return gracefully rather than throwing
    const url = `${TIKTOK_API_BASE}/video/delete/`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({ video_id: platformPostId }),
    });

    // 200 = success; 404 = already gone, treat as success
    if (!response.ok && response.status !== 404) {
      let message = response.statusText;
      try {
        const body = (await response.json()) as TikTokErrorBody;
        message = body.error?.message ?? message;
      } catch {
        // ignore parse error
      }
      throw new Error(`TikTok delete error (${response.status}): ${message}`);
    }
  }

  async getInsights(platformPostId: string, token: string): Promise<Insights> {
    const url = `${TIKTOK_API_BASE}/video/query/?fields=id,like_count,comment_count,share_count,view_count`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({
          filters: { video_ids: [platformPostId] },
        }),
      });

      if (!response.ok) return {};

      const parsed = videoQueryResponseSchema.safeParse(await response.json());
      if (!parsed.success) return {};

      const video = parsed.data.data?.videos?.[0];
      if (!video) return {};

      return {
        impressions: video.view_count,
        likes: video.like_count,
        comments: video.comment_count,
        shares: video.share_count,
      };
    } catch {
      return {};
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async initVideoPublish(
    token: string,
    videoUrl: string,
    caption: string
  ): Promise<string> {
    const url = `${TIKTOK_API_BASE}/post/publish/video/init/`;

    // Trim caption to TikTok's 2200-char limit
    const trimmedCaption = caption.slice(0, 2200);

    const body = {
      post_info: {
        title: trimmedCaption,
        privacy_level: "PUBLIC_TO_EVERYONE",
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
        video_cover_timestamp_ms: 1000,
      },
      source_info: {
        source: "PULL_FROM_URL",
        video_url: videoUrl,
      },
    };

    const data = await tikTokApiFetch(
      url,
      publishInitResponseSchema,
      token,
      {
        method: "POST",
        body: JSON.stringify(body),
      }
    );

    if (data.error?.code && data.error.code !== "ok") {
      throw new Error(
        `TikTok publish init failed: ${data.error.message ?? data.error.code}`
      );
    }

    return data.data.publish_id;
  }
}

export const tikTokAdapter = new TikTokAdapter();
