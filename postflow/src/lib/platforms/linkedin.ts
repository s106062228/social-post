import { z } from "zod";
import { MediaType } from "@prisma/client";
import {
  PostContent,
  PublishResult,
  PostStatus,
  Insights,
  PlatformAdapter,
} from "./types";

const LINKEDIN_API_BASE = "https://api.linkedin.com/rest";
const LINKEDIN_API_VERSION = "202406";

// ── Zod schemas ───────────────────────────────────────────────────────────────

const createPostResponseSchema = z.object({
  id: z.string(),
});

const postStatusSchema = z.object({
  id: z.string(),
  lifecycleState: z.string().optional(),
});

const initUploadResponseSchema = z.object({
  value: z.object({
    uploadUrl: z.string(),
    image: z.string(),
  }),
});

const postStatsSchema = z.object({
  elements: z
    .array(
      z.object({
        totalShareStatistics: z
          .object({
            likeCount: z.number().optional(),
            commentCount: z.number().optional(),
            shareCount: z.number().optional(),
            impressionCount: z.number().optional(),
            uniqueImpressionsCount: z.number().optional(),
          })
          .optional(),
      })
    )
    .optional(),
});

// ── Internal helpers ──────────────────────────────────────────────────────────

interface LinkedInErrorBody {
  message?: string;
  status?: number;
  error?: string;
  error_description?: string;
}

async function liLinkedInFetch<T>(
  url: string,
  schema: z.ZodType<T>,
  token: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "LinkedIn-Version": LINKEDIN_API_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
      ...(options?.headers ?? {}),
    },
  });

  const data: unknown = await response.json();

  if (!response.ok) {
    const err = data as LinkedInErrorBody;
    throw new Error(
      `LinkedIn API error (${response.status}): ${err.message ?? err.error_description ?? err.error ?? response.statusText}`
    );
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `LinkedIn API response validation failed: ${parsed.error.message}`
    );
  }

  return parsed.data;
}

// ── LinkedIn Adapter ──────────────────────────────────────────────────────────

export class LinkedInAdapter implements PlatformAdapter {
  /**
   * Publish a post to a LinkedIn personal profile.
   * Supports text (NONE) and single-image (IMAGE) posts.
   * VIDEO and CAROUSEL are not yet supported.
   */
  async publish(
    post: PostContent,
    authorUrn: string,
    token: string
  ): Promise<PublishResult> {
    let platformPostId: string;

    switch (post.mediaType) {
      case MediaType.NONE:
        platformPostId = await this.publishTextPost(
          authorUrn,
          token,
          post.content
        );
        break;

      case MediaType.IMAGE:
        if (post.mediaUrls.length === 0) {
          throw new Error("IMAGE post requires at least one media URL");
        }
        platformPostId = await this.publishImagePost(
          authorUrn,
          token,
          post.mediaUrls[0],
          post.content
        );
        break;

      case MediaType.VIDEO:
      case MediaType.CAROUSEL:
        throw new Error(
          `LinkedIn adapter does not yet support ${post.mediaType} posts`
        );

      default:
        throw new Error(`Unsupported media type: ${post.mediaType}`);
    }

    return {
      platformPostId,
      publishedUrl: `https://www.linkedin.com/feed/update/${platformPostId}/`,
      publishedAt: new Date(),
    };
  }

  async getStatus(platformPostId: string, token: string): Promise<PostStatus> {
    const url = `${LINKEDIN_API_BASE}/posts/${encodeURIComponent(platformPostId)}`;

    try {
      const data = await liLinkedInFetch(url, postStatusSchema, token);
      const state = data.lifecycleState?.toUpperCase();
      if (state === "PUBLISHED") return { status: "PUBLISHED" };
      if (state === "DRAFT") return { status: "PROCESSING" };
      return { status: "PUBLISHED" };
    } catch (err) {
      return {
        status: "FAILED",
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  async deletePost(platformPostId: string, token: string): Promise<void> {
    const url = `${LINKEDIN_API_BASE}/posts/${encodeURIComponent(platformPostId)}`;

    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "LinkedIn-Version": LINKEDIN_API_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
      },
    });

    if (!response.ok) {
      let message = response.statusText;
      try {
        const body = (await response.json()) as LinkedInErrorBody;
        message = body.message ?? body.error ?? message;
      } catch {
        // ignore parse error
      }
      throw new Error(`LinkedIn delete error (${response.status}): ${message}`);
    }
  }

  async getInsights(platformPostId: string, token: string): Promise<Insights> {
    const url = `${LINKEDIN_API_BASE}/socialMetadata/${encodeURIComponent(platformPostId)}`;

    try {
      const data = await liLinkedInFetch(url, postStatsSchema, token);
      const stats = data.elements?.[0]?.totalShareStatistics;
      if (!stats) return {};

      return {
        impressions: stats.impressionCount,
        reach: stats.uniqueImpressionsCount,
        likes: stats.likeCount,
        comments: stats.commentCount,
        shares: stats.shareCount,
      };
    } catch {
      return {};
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async publishTextPost(
    authorUrn: string,
    token: string,
    text: string
  ): Promise<string> {
    const url = `${LINKEDIN_API_BASE}/posts`;
    const body = {
      author: authorUrn,
      commentary: text,
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    };

    const data = await liLinkedInFetch(url, createPostResponseSchema, token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    return data.id;
  }

  private async publishImagePost(
    authorUrn: string,
    token: string,
    imageUrl: string,
    text: string
  ): Promise<string> {
    // Step 1: Register an image upload
    const initUrl = `${LINKEDIN_API_BASE}/images?action=initializeUpload`;
    const initBody = {
      initializeUploadRequest: { owner: authorUrn },
    };

    const initData = await liLinkedInFetch(
      initUrl,
      initUploadResponseSchema,
      token,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(initBody),
      }
    );

    const { uploadUrl, image: imageUrn } = initData.value;

    // Step 2: Download the image from the public URL and upload to LinkedIn
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(
        `Failed to fetch image for LinkedIn upload: ${imageResponse.statusText}`
      );
    }
    const imageBuffer = await imageResponse.arrayBuffer();

    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type":
          imageResponse.headers.get("content-type") ?? "image/jpeg",
      },
      body: imageBuffer,
    });

    if (!uploadResponse.ok) {
      throw new Error(
        `LinkedIn image upload failed (${uploadResponse.status}): ${uploadResponse.statusText}`
      );
    }

    // Step 3: Create the post referencing the uploaded image
    const postUrl = `${LINKEDIN_API_BASE}/posts`;
    const postBody = {
      author: authorUrn,
      commentary: text,
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      content: {
        media: {
          id: imageUrn,
        },
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    };

    const data = await liLinkedInFetch(
      postUrl,
      createPostResponseSchema,
      token,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(postBody),
      }
    );

    return data.id;
  }
}

export const linkedInAdapter = new LinkedInAdapter();
