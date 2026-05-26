import { z } from "zod";
import { MediaType } from "@prisma/client";
import {
  PostContent,
  PublishResult,
  PostStatus,
  Insights,
  PlatformAdapter,
} from "./types";

const VIMEO_API_BASE = "https://api.vimeo.com";
const VIMEO_ACCEPT_HEADER = "application/vnd.vimeo.*+json;version=3.4";

// ── Zod schemas ───────────────────────────────────────────────────────────────

const videoCreateResponseSchema = z.object({
  uri: z.string(),
  link: z.string().optional(),
  upload: z
    .object({
      status: z.string().optional(),
      link: z.string().optional(),
    })
    .optional(),
});

const videoStatusSchema = z.object({
  uri: z.string(),
  status: z.string().optional(),
  link: z.string().optional(),
});

const videoStatsSchema = z.object({
  uri: z.string(),
  stats: z
    .object({
      plays: z.number().optional(),
    })
    .optional(),
  metadata: z
    .object({
      connections: z
        .object({
          comments: z.object({ total: z.number().optional() }).optional(),
          likes: z.object({ total: z.number().optional() }).optional(),
        })
        .optional(),
    })
    .optional(),
});

// ── Internal helpers ──────────────────────────────────────────────────────────

interface VimeoErrorBody {
  error?: string;
  developer_message?: string;
  error_code?: number;
}

async function vimeoApiFetch<T>(
  url: string,
  schema: z.ZodType<T>,
  token: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: VIMEO_ACCEPT_HEADER,
      ...(options?.headers ?? {}),
    },
  });

  const data: unknown = await response.json();

  if (!response.ok) {
    const err = data as VimeoErrorBody;
    const msg =
      err.developer_message ?? err.error ?? response.statusText;
    throw new Error(`Vimeo API error (${response.status}): ${msg}`);
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Vimeo API response validation failed: ${parsed.error.message}`
    );
  }

  return parsed.data;
}

/**
 * Extracts the numeric video ID from a Vimeo video URI (e.g. /videos/123456).
 */
function extractVideoId(uri: string): string {
  const parts = uri.split("/");
  return parts[parts.length - 1] ?? uri;
}

// ── Vimeo Adapter ─────────────────────────────────────────────────────────────

export class VimeoAdapter implements PlatformAdapter {
  /**
   * Publish a video to Vimeo.
   * Only VIDEO posts with at least one media URL are supported.
   * Uses the "pull" upload approach — Vimeo fetches the video from the given URL.
   */
  async publish(
    post: PostContent,
    _accountId: string,
    token: string
  ): Promise<PublishResult> {
    if (post.mediaType !== MediaType.VIDEO) {
      throw new Error(
        `Vimeo adapter only supports VIDEO posts, got ${post.mediaType}`
      );
    }

    if (post.mediaUrls.length === 0) {
      throw new Error("VIDEO post requires at least one media URL");
    }

    const videoUrl = post.mediaUrls[0];

    // Build the snippet — use first line as title, rest as description
    const lines = post.content.split("\n");
    const title = (lines[0] ?? "").slice(0, 128) || "New Video";
    const videoDescription = lines.slice(1).join("\n").trim() || post.content;

    const body = {
      name: title,
      description: videoDescription.slice(0, 5000),
      privacy: { view: "anybody" },
      upload: {
        approach: "pull",
        link: videoUrl,
      },
    };

    const data = await vimeoApiFetch(
      `${VIMEO_API_BASE}/me/videos`,
      videoCreateResponseSchema,
      token,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    const videoId = extractVideoId(data.uri);
    const publishedUrl =
      data.link ?? `https://vimeo.com/${videoId}`;

    return {
      platformPostId: videoId,
      publishedUrl,
      publishedAt: new Date(),
    };
  }

  async getStatus(platformPostId: string, token: string): Promise<PostStatus> {
    const url = `${VIMEO_API_BASE}/videos/${encodeURIComponent(platformPostId)}`;

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: VIMEO_ACCEPT_HEADER,
        },
      });

      if (!response.ok) {
        return { status: "FAILED", error: `HTTP ${response.status}` };
      }

      const data = (await response.json()) as { status?: string };
      const status = data.status;

      if (status === "available") {
        return { status: "PUBLISHED" };
      }
      if (status === "quota_exceeded" || status === "total_cap_exceeded" || status === "upload_error") {
        return { status: "FAILED", error: `Video status: ${status}` };
      }
      // "uploading", "transcoding", "uploading_error" etc.
      return { status: "PROCESSING" };
    } catch (err) {
      return {
        status: "FAILED",
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  async deletePost(platformPostId: string, token: string): Promise<void> {
    const url = `${VIMEO_API_BASE}/videos/${encodeURIComponent(platformPostId)}`;

    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: VIMEO_ACCEPT_HEADER,
      },
    });

    // 204 No Content = success; 404 = already gone, treat as success
    if (!response.ok && response.status !== 404) {
      let message = response.statusText;
      try {
        const body = (await response.json()) as VimeoErrorBody;
        message = body.developer_message ?? body.error ?? message;
      } catch {
        // ignore parse error
      }
      throw new Error(`Vimeo delete error (${response.status}): ${message}`);
    }
  }

  async getInsights(platformPostId: string, token: string): Promise<Insights> {
    const url = `${VIMEO_API_BASE}/videos/${encodeURIComponent(platformPostId)}?fields=uri,stats,metadata`;

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: VIMEO_ACCEPT_HEADER,
        },
      });

      if (!response.ok) return {};

      const data = (await response.json()) as {
        stats?: { plays?: number };
        metadata?: {
          connections?: {
            comments?: { total?: number };
            likes?: { total?: number };
          };
        };
      };

      const parsed = videoStatsSchema.safeParse(data);
      if (!parsed.success) return {};

      const plays = parsed.data.stats?.plays;
      const likes = parsed.data.metadata?.connections?.likes?.total;
      const comments = parsed.data.metadata?.connections?.comments?.total;

      return {
        impressions: plays !== undefined ? plays : undefined,
        likes: likes !== undefined ? likes : undefined,
        comments: comments !== undefined ? comments : undefined,
      };
    } catch {
      return {};
    }
  }
}

export const vimeoAdapter = new VimeoAdapter();
