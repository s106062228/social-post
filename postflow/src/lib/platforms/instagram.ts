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

const containerSchema = z.object({ id: z.string() });

const publishSchema = z.object({ id: z.string() });

const containerStatusSchema = z.object({
  status_code: z.enum([
    "EXPIRED",
    "ERROR",
    "FINISHED",
    "IN_PROGRESS",
    "PUBLISHED",
  ]),
  status: z.string().optional(),
});

const mediaInfoSchema = z.object({
  id: z.string(),
  permalink: z.string().optional(),
  timestamp: z.string().optional(),
});

const insightsSchema = z.object({
  data: z.array(
    z.object({
      name: z.string(),
      values: z.array(z.object({ value: z.number() })).optional(),
      // Single-value metrics
      value: z.number().optional(),
    })
  ),
});

// ── Internal helpers ──────────────────────────────────────────────────────────

interface MetaErrorBody {
  error?: { message?: string; code?: number };
}

async function igFetch<T>(
  url: string,
  schema: z.ZodType<T>,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, options);
  const data: unknown = await response.json();

  if (!response.ok) {
    const errorBody = data as MetaErrorBody;
    throw new Error(
      `Instagram API error (${response.status}): ${errorBody.error?.message ?? response.statusText}`
    );
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Instagram API response validation failed: ${parsed.error.message}`
    );
  }

  return parsed.data;
}

async function igPost<T>(
  path: string,
  token: string,
  schema: z.ZodType<T>,
  body: Record<string, string | boolean>
): Promise<T> {
  const params = new URLSearchParams({ access_token: token });
  const url = `${META_API_BASE}/${path}?${params.toString()}`;

  return igFetch(url, schema, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Poll the container status until it is FINISHED, PUBLISHED, or FAILED.
 * IG video containers can take up to several minutes to process.
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
      fields: "status_code",
    });
    const url = `${META_API_BASE}/${containerId}?${params.toString()}`;
    const data = await igFetch(url, containerStatusSchema);

    if (data.status_code === "FINISHED" || data.status_code === "PUBLISHED") {
      return;
    }

    if (data.status_code === "ERROR" || data.status_code === "EXPIRED") {
      throw new Error(
        `Instagram container processing failed with status: ${data.status_code}`
      );
    }

    // IN_PROGRESS — wait and retry
    await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    "Instagram container did not finish processing within the timeout period"
  );
}

// ── Instagram Adapter ─────────────────────────────────────────────────────────

export class InstagramAdapter implements PlatformAdapter {
  /**
   * Publish a post to an Instagram Business/Creator account.
   * Uses the two-step container → publish flow.
   * Supports IMAGE, VIDEO, and CAROUSEL media types.
   *
   * Note: Instagram does not support native scheduling via API.
   * Scheduled posts must be handled by a BullMQ delayed job.
   */
  async publish(
    post: PostContent,
    igUserId: string,
    token: string
  ): Promise<PublishResult> {
    let mediaId: string;

    switch (post.mediaType) {
      case MediaType.IMAGE:
        if (post.mediaUrls.length === 0) {
          throw new Error("IMAGE post requires at least one media URL");
        }
        if (post.mediaUrls.length === 1) {
          mediaId = await this.publishSingleImage(
            igUserId,
            token,
            post.mediaUrls[0],
            post.content
          );
        } else {
          mediaId = await this.publishCarousel(
            igUserId,
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
          igUserId,
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
          igUserId,
          token,
          post.mediaUrls,
          post.content
        );
        break;

      case MediaType.NONE:
        // IG requires media; treat text-only as unsupported
        throw new Error(
          "Instagram requires media. Text-only posts are not supported."
        );

      default:
        throw new Error(`Unsupported media type: ${post.mediaType}`);
    }

    // Fetch permalink
    const params = new URLSearchParams({
      access_token: token,
      fields: "id,permalink,timestamp",
    });
    const url = `${META_API_BASE}/${mediaId}?${params.toString()}`;
    const mediaInfo = await igFetch(url, mediaInfoSchema);

    return {
      platformPostId: mediaId,
      publishedUrl: mediaInfo.permalink,
      publishedAt: new Date(),
    };
  }

  async getStatus(platformPostId: string, token: string): Promise<PostStatus> {
    const params = new URLSearchParams({
      access_token: token,
      fields: "status_code",
    });
    const url = `${META_API_BASE}/${platformPostId}?${params.toString()}`;

    try {
      const data = await igFetch(url, containerStatusSchema);
      switch (data.status_code) {
        case "FINISHED":
        case "PUBLISHED":
          return { status: "PUBLISHED" };
        case "IN_PROGRESS":
          return { status: "PROCESSING" };
        case "ERROR":
        case "EXPIRED":
          return { status: "FAILED", error: `Container status: ${data.status_code}` };
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
    const url = `${META_API_BASE}/${platformPostId}?${params.toString()}`;

    const response = await fetch(url, { method: "DELETE" });
    if (!response.ok) {
      const data = (await response.json()) as MetaErrorBody;
      throw new Error(
        `Instagram delete error (${response.status}): ${data.error?.message ?? response.statusText}`
      );
    }
  }

  async getInsights(platformPostId: string, token: string): Promise<Insights> {
    const metrics = [
      "impressions",
      "reach",
      "likes",
      "comments",
      "shares",
    ].join(",");

    const params = new URLSearchParams({
      access_token: token,
      metric: metrics,
    });
    const url = `${META_API_BASE}/${platformPostId}/insights?${params.toString()}`;

    try {
      const data = await igFetch(url, insightsSchema);

      const getValue = (name: string): number | undefined => {
        const metric = data.data.find((m) => m.name === name);
        if (!metric) return undefined;
        if (metric.value !== undefined) return metric.value;
        return metric.values?.[0]?.value;
      };

      return {
        impressions: getValue("impressions"),
        reach: getValue("reach"),
        likes: getValue("likes"),
        comments: getValue("comments"),
        shares: getValue("shares"),
      };
    } catch {
      return {};
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async createImageContainer(
    igUserId: string,
    token: string,
    imageUrl: string,
    caption: string,
    isCarouselItem = false
  ): Promise<string> {
    const body: Record<string, string | boolean> = {
      image_url: imageUrl,
      caption,
    };
    if (isCarouselItem) {
      body.is_carousel_item = true;
    }

    const data = await igPost(
      `${igUserId}/media`,
      token,
      containerSchema,
      body
    );
    return data.id;
  }

  private async createVideoContainer(
    igUserId: string,
    token: string,
    videoUrl: string,
    caption: string
  ): Promise<string> {
    const data = await igPost(
      `${igUserId}/media`,
      token,
      containerSchema,
      {
        video_url: videoUrl,
        caption,
        media_type: "REELS",
      }
    );
    return data.id;
  }

  private async publishContainer(
    igUserId: string,
    token: string,
    containerId: string
  ): Promise<string> {
    const data = await igPost(
      `${igUserId}/media_publish`,
      token,
      publishSchema,
      { creation_id: containerId }
    );
    return data.id;
  }

  private async publishSingleImage(
    igUserId: string,
    token: string,
    imageUrl: string,
    caption: string
  ): Promise<string> {
    const containerId = await this.createImageContainer(
      igUserId,
      token,
      imageUrl,
      caption
    );
    return this.publishContainer(igUserId, token, containerId);
  }

  private async publishVideo(
    igUserId: string,
    token: string,
    videoUrl: string,
    caption: string
  ): Promise<string> {
    const containerId = await this.createVideoContainer(
      igUserId,
      token,
      videoUrl,
      caption
    );
    // Video containers must finish processing before publishing
    await pollContainerStatus(containerId, token);
    return this.publishContainer(igUserId, token, containerId);
  }

  private async publishCarousel(
    igUserId: string,
    token: string,
    mediaUrls: string[],
    caption: string
  ): Promise<string> {
    // Step 1: create a container for each image
    const itemIds = await Promise.all(
      mediaUrls.map((url) =>
        this.createImageContainer(igUserId, token, url, "", true)
      )
    );

    // Step 2: create the carousel container
    const carouselData = await igPost(
      `${igUserId}/media`,
      token,
      containerSchema,
      {
        media_type: "CAROUSEL",
        children: itemIds.join(","),
        caption,
      }
    );

    // Step 3: publish the carousel
    return this.publishContainer(igUserId, token, carouselData.id);
  }
}

// Export a singleton instance
export const instagramAdapter = new InstagramAdapter();
