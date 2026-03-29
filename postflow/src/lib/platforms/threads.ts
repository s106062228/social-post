import { z } from "zod";
import { MediaType } from "@prisma/client";
import {
  PostContent,
  PublishResult,
  PostStatus,
  Insights,
  PlatformAdapter,
} from "./types";

const THREADS_API_BASE = "https://graph.threads.net/v21.0";

// ── Zod schemas ───────────────────────────────────────────────────────────────

const containerSchema = z.object({ id: z.string() });

const publishSchema = z.object({ id: z.string() });

const containerStatusSchema = z.object({
  status: z.string(),
  error_message: z.string().optional(),
});

const threadMediaSchema = z.object({
  id: z.string(),
  permalink: z.string().optional(),
  timestamp: z.string().optional(),
});

const insightsSchema = z.object({
  data: z.array(
    z.object({
      name: z.string(),
      period: z.string(),
      values: z.array(z.object({ value: z.number(), end_time: z.string() })).optional(),
      value: z.number().optional(),
    })
  ),
});

// ── Internal helpers ──────────────────────────────────────────────────────────

interface MetaErrorBody {
  error?: { message?: string; code?: number };
}

async function threadsFetch<T>(
  url: string,
  schema: z.ZodType<T>,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, options);
  const data: unknown = await response.json();

  if (!response.ok) {
    const errorBody = data as MetaErrorBody;
    throw new Error(
      `Threads API error (${response.status}): ${errorBody.error?.message ?? response.statusText}`
    );
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Threads API response validation failed: ${parsed.error.message}`
    );
  }

  return parsed.data;
}

async function threadsPost<T>(
  path: string,
  token: string,
  schema: z.ZodType<T>,
  body: Record<string, string | boolean>
): Promise<T> {
  const params = new URLSearchParams({ access_token: token });
  const url = `${THREADS_API_BASE}/${path}?${params.toString()}`;

  return threadsFetch(url, schema, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Poll the Threads container status until it is FINISHED or fails.
 * Video containers require processing time before they can be published.
 */
async function pollContainerStatus(
  containerId: string,
  token: string,
  maxAttempts = 20,
  intervalMs = 5000
): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const params = new URLSearchParams({
      access_token: token,
      fields: "status,error_message",
    });
    const url = `${THREADS_API_BASE}/${containerId}?${params.toString()}`;
    const data = await threadsFetch(url, containerStatusSchema);

    if (data.status === "FINISHED" || data.status === "PUBLISHED") {
      return;
    }

    if (data.status === "ERROR" || data.status === "EXPIRED") {
      throw new Error(
        `Threads container processing failed: ${data.error_message ?? data.status}`
      );
    }

    // IN_PROGRESS — wait and retry
    await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    "Threads container did not finish processing within the timeout period"
  );
}

// ── Threads Adapter ───────────────────────────────────────────────────────────

export class ThreadsAdapter implements PlatformAdapter {
  /**
   * Publish a post to Threads.
   * Uses the two-step container → publish flow via graph.threads.net.
   * Supports TEXT, IMAGE, and VIDEO media types.
   *
   * Note: Threads does not support native scheduling via API.
   * Scheduled posts must be handled by a BullMQ delayed job.
   */
  async publish(
    post: PostContent,
    threadsUserId: string,
    token: string
  ): Promise<PublishResult> {
    let mediaId: string;

    switch (post.mediaType) {
      case MediaType.NONE:
        mediaId = await this.publishTextPost(
          threadsUserId,
          token,
          post.content
        );
        break;

      case MediaType.IMAGE:
        if (post.mediaUrls.length === 0) {
          throw new Error("IMAGE post requires at least one media URL");
        }
        if (post.mediaUrls.length === 1) {
          mediaId = await this.publishSingleImage(
            threadsUserId,
            token,
            post.mediaUrls[0],
            post.content
          );
        } else {
          // Threads carousel
          mediaId = await this.publishCarousel(
            threadsUserId,
            token,
            post.mediaUrls,
            post.content
          );
        }
        break;

      case MediaType.VIDEO:
        if (post.mediaUrls.length === 0) {
          throw new Error("VIDEO post requires a media URL");
        }
        mediaId = await this.publishVideo(
          threadsUserId,
          token,
          post.mediaUrls[0],
          post.content
        );
        break;

      case MediaType.CAROUSEL:
        if (post.mediaUrls.length < 2) {
          throw new Error("CAROUSEL post requires at least two media URLs");
        }
        mediaId = await this.publishCarousel(
          threadsUserId,
          token,
          post.mediaUrls,
          post.content
        );
        break;

      default:
        throw new Error(`Unsupported media type: ${post.mediaType}`);
    }

    // Fetch permalink
    const params = new URLSearchParams({
      access_token: token,
      fields: "id,permalink,timestamp",
    });
    const url = `${THREADS_API_BASE}/${mediaId}?${params.toString()}`;

    let publishedUrl: string | undefined;
    try {
      const mediaInfo = await threadsFetch(url, threadMediaSchema);
      publishedUrl = mediaInfo.permalink;
    } catch {
      // Permalink may not be immediately available
    }

    return {
      platformPostId: mediaId,
      publishedUrl,
      publishedAt: new Date(),
    };
  }

  async getStatus(platformPostId: string, token: string): Promise<PostStatus> {
    const params = new URLSearchParams({
      access_token: token,
      fields: "status,error_message",
    });
    const url = `${THREADS_API_BASE}/${platformPostId}?${params.toString()}`;

    try {
      const data = await threadsFetch(url, containerStatusSchema);
      switch (data.status) {
        case "FINISHED":
        case "PUBLISHED":
          return { status: "PUBLISHED" };
        case "IN_PROGRESS":
          return { status: "PROCESSING" };
        case "ERROR":
        case "EXPIRED":
          return {
            status: "FAILED",
            error: data.error_message ?? `Container status: ${data.status}`,
          };
        default:
          return { status: "PENDING" };
      }
    } catch (err) {
      return {
        status: "FAILED",
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  async deletePost(platformPostId: string, token: string): Promise<void> {
    const params = new URLSearchParams({ access_token: token });
    const url = `${THREADS_API_BASE}/${platformPostId}?${params.toString()}`;

    const response = await fetch(url, { method: "DELETE" });
    if (!response.ok) {
      const data = (await response.json()) as MetaErrorBody;
      throw new Error(
        `Threads delete error (${response.status}): ${data.error?.message ?? response.statusText}`
      );
    }
  }

  async getInsights(platformPostId: string, token: string): Promise<Insights> {
    const metrics = ["views", "likes", "replies", "reposts", "quotes"].join(",");

    const params = new URLSearchParams({
      access_token: token,
      metric: metrics,
    });
    const url = `${THREADS_API_BASE}/${platformPostId}/insights?${params.toString()}`;

    try {
      const data = await threadsFetch(url, insightsSchema);

      const getValue = (name: string): number | undefined => {
        const metric = data.data.find((m) => m.name === name);
        if (!metric) return undefined;
        if (metric.value !== undefined) return metric.value;
        return metric.values?.[0]?.value;
      };

      return {
        impressions: getValue("views"),
        likes: getValue("likes"),
        comments: getValue("replies"),
        shares: getValue("reposts"),
      };
    } catch {
      return {};
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async publishTextPost(
    userId: string,
    token: string,
    text: string
  ): Promise<string> {
    const containerId = await threadsPost(
      `${userId}/threads`,
      token,
      containerSchema,
      { media_type: "TEXT", text }
    ).then((d) => d.id);

    return this.publishContainer(userId, token, containerId);
  }

  private async publishSingleImage(
    userId: string,
    token: string,
    imageUrl: string,
    text: string
  ): Promise<string> {
    const containerId = await threadsPost(
      `${userId}/threads`,
      token,
      containerSchema,
      { media_type: "IMAGE", image_url: imageUrl, text }
    ).then((d) => d.id);

    return this.publishContainer(userId, token, containerId);
  }

  private async publishVideo(
    userId: string,
    token: string,
    videoUrl: string,
    text: string
  ): Promise<string> {
    const containerId = await threadsPost(
      `${userId}/threads`,
      token,
      containerSchema,
      { media_type: "VIDEO", video_url: videoUrl, text }
    ).then((d) => d.id);

    // Video containers require processing time
    await pollContainerStatus(containerId, token);
    return this.publishContainer(userId, token, containerId);
  }

  private async publishCarousel(
    userId: string,
    token: string,
    mediaUrls: string[],
    text: string
  ): Promise<string> {
    // Step 1: create item containers
    const itemIds = await Promise.all(
      mediaUrls.map((url) =>
        threadsPost(`${userId}/threads`, token, containerSchema, {
          media_type: "IMAGE",
          image_url: url,
          is_carousel_item: true,
        }).then((d) => d.id)
      )
    );

    // Step 2: create carousel container
    const carouselId = await threadsPost(
      `${userId}/threads`,
      token,
      containerSchema,
      {
        media_type: "CAROUSEL",
        children: itemIds.join(","),
        text,
      }
    ).then((d) => d.id);

    // Step 3: publish
    return this.publishContainer(userId, token, carouselId);
  }

  private async publishContainer(
    userId: string,
    token: string,
    containerId: string
  ): Promise<string> {
    const data = await threadsPost(
      `${userId}/threads_publish`,
      token,
      publishSchema,
      { creation_id: containerId }
    );
    return data.id;
  }
}

// Export a singleton instance
export const threadsAdapter = new ThreadsAdapter();
