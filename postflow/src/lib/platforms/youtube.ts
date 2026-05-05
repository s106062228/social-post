import { z } from "zod";
import { MediaType } from "@prisma/client";
import {
  PostContent,
  PublishResult,
  PostStatus,
  Insights,
  PlatformAdapter,
} from "./types";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const YOUTUBE_UPLOAD_BASE =
  "https://www.googleapis.com/upload/youtube/v3/videos";

// ── Zod schemas ───────────────────────────────────────────────────────────────

const videoInsertResponseSchema = z.object({
  id: z.string(),
  status: z
    .object({
      uploadStatus: z.string().optional(),
      privacyStatus: z.string().optional(),
    })
    .optional(),
});

const videoStatusSchema = z.object({
  id: z.string(),
  status: z
    .object({
      uploadStatus: z.string().optional(),
      privacyStatus: z.string().optional(),
    })
    .optional(),
});

const videoStatisticsSchema = z.object({
  statistics: z
    .object({
      viewCount: z.string().optional(),
      likeCount: z.string().optional(),
      commentCount: z.string().optional(),
    })
    .optional(),
});

// ── Internal helpers ──────────────────────────────────────────────────────────

interface YouTubeErrorBody {
  error?: {
    code?: number;
    message?: string;
    errors?: Array<{ message?: string; reason?: string }>;
  };
}

async function youTubeApiFetch<T>(
  url: string,
  schema: z.ZodType<T>,
  token: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
  });

  const data: unknown = await response.json();

  if (!response.ok) {
    const err = data as YouTubeErrorBody;
    const msg =
      err.error?.message ??
      err.error?.errors?.[0]?.message ??
      response.statusText;
    throw new Error(`YouTube API error (${response.status}): ${msg}`);
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `YouTube API response validation failed: ${parsed.error.message}`
    );
  }

  return parsed.data;
}

// ── YouTube Adapter ───────────────────────────────────────────────────────────

export class YouTubeAdapter implements PlatformAdapter {
  /**
   * Publish a video to YouTube.
   * Only VIDEO posts with at least one media URL are supported.
   * The mediaUrl must be a publicly accessible video file URL.
   */
  async publish(
    post: PostContent,
    _channelId: string,
    token: string
  ): Promise<PublishResult> {
    if (post.mediaType !== MediaType.VIDEO) {
      throw new Error(
        `YouTube adapter only supports VIDEO posts, got ${post.mediaType}`
      );
    }

    if (post.mediaUrls.length === 0) {
      throw new Error("VIDEO post requires at least one media URL");
    }

    const videoUrl = post.mediaUrls[0];
    const platformPostId = await this.uploadVideo(token, videoUrl, post.content);

    return {
      platformPostId,
      publishedUrl: `https://www.youtube.com/watch?v=${platformPostId}`,
      publishedAt: new Date(),
    };
  }

  async getStatus(platformPostId: string, token: string): Promise<PostStatus> {
    const url = `${YOUTUBE_API_BASE}/videos?part=status&id=${encodeURIComponent(platformPostId)}`;

    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        return { status: "FAILED", error: `HTTP ${response.status}` };
      }

      const data = (await response.json()) as {
        items?: Array<{ id: string; status?: { uploadStatus?: string } }>;
      };
      const item = data.items?.[0];
      if (!item) return { status: "FAILED", error: "Video not found" };

      const uploadStatus = item.status?.uploadStatus;
      if (uploadStatus === "processed" || uploadStatus === "uploaded") {
        return { status: "PUBLISHED" };
      }
      if (uploadStatus === "failed" || uploadStatus === "rejected") {
        return { status: "FAILED", error: `Upload status: ${uploadStatus}` };
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
    const url = `${YOUTUBE_API_BASE}/videos?id=${encodeURIComponent(platformPostId)}`;

    const response = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    // 204 No Content = success; 404 = already gone, treat as success
    if (!response.ok && response.status !== 404) {
      let message = response.statusText;
      try {
        const body = (await response.json()) as YouTubeErrorBody;
        message = body.error?.message ?? message;
      } catch {
        // ignore parse error
      }
      throw new Error(`YouTube delete error (${response.status}): ${message}`);
    }
  }

  async getInsights(platformPostId: string, token: string): Promise<Insights> {
    const url = `${YOUTUBE_API_BASE}/videos?part=statistics&id=${encodeURIComponent(platformPostId)}`;

    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) return {};

      const data = (await response.json()) as {
        items?: Array<{ statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }>;
      };
      const stats = data.items?.[0]?.statistics;
      if (!stats) return {};

      return {
        impressions: stats.viewCount ? parseInt(stats.viewCount, 10) : undefined,
        likes: stats.likeCount ? parseInt(stats.likeCount, 10) : undefined,
        comments: stats.commentCount
          ? parseInt(stats.commentCount, 10)
          : undefined,
      };
    } catch {
      return {};
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async uploadVideo(
    token: string,
    videoUrl: string,
    description: string
  ): Promise<string> {
    // Fetch the video bytes from the public URL
    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) {
      throw new Error(
        `Failed to fetch video for YouTube upload: ${videoResponse.statusText}`
      );
    }
    const videoBuffer = await videoResponse.arrayBuffer();
    const contentType =
      videoResponse.headers.get("content-type") ?? "video/mp4";

    // Build the snippet — use first line as title, rest as description
    const lines = description.split("\n");
    const title = (lines[0] ?? "").slice(0, 100) || "New Video";
    const videoDescription = lines.slice(1).join("\n").trim() || description;

    // Use multipart upload: metadata part + binary part
    const metadata = {
      snippet: {
        title,
        description: videoDescription.slice(0, 5000),
        categoryId: "22", // People & Blogs
      },
      status: {
        privacyStatus: "public",
        selfDeclaredMadeForKids: false,
      },
    };

    const boundary = "boundary_postflow_yt";
    const metadataPart = [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify(metadata),
    ].join("\r\n");

    const closingBoundary = `\r\n--${boundary}--`;

    // Build multipart body as Uint8Array
    const encoder = new TextEncoder();
    const metaBytes = encoder.encode(
      metadataPart +
        `\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`
    );
    const closingBytes = encoder.encode(closingBoundary);
    const videoBytes = new Uint8Array(videoBuffer);

    const bodyBuffer = new Uint8Array(
      metaBytes.length + videoBytes.length + closingBytes.length
    );
    bodyBuffer.set(metaBytes, 0);
    bodyBuffer.set(videoBytes, metaBytes.length);
    bodyBuffer.set(closingBytes, metaBytes.length + videoBytes.length);

    const uploadUrl = `${YOUTUBE_UPLOAD_BASE}?uploadType=multipart&part=snippet,status`;

    const data = await youTubeApiFetch(
      uploadUrl,
      videoInsertResponseSchema,
      token,
      {
        method: "POST",
        headers: {
          "Content-Type": `multipart/related; boundary="${boundary}"`,
          "Content-Length": bodyBuffer.length.toString(),
        },
        body: bodyBuffer,
      }
    );

    return data.id;
  }
}

export const youTubeAdapter = new YouTubeAdapter();
