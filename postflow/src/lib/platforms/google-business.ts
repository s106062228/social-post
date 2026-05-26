import { z } from "zod";
import { MediaType } from "@prisma/client";
import {
  PostContent,
  PublishResult,
  PostStatus,
  Insights,
  PlatformAdapter,
} from "./types";
import { parseGoogleBusinessToken } from "@/lib/auth/google-business-oauth";

const GBP_API_BASE = "https://mybusiness.googleapis.com/v4";
const GBP_TEXT_LIMIT = 1500;

// ── Zod schemas ───────────────────────────────────────────────────────────────

const localPostResponseSchema = z.object({
  name: z.string(),
  state: z.string().optional(),
  searchUrl: z.string().optional(),
});

const localPostGetSchema = z.object({
  name: z.string(),
  state: z.string().optional(),
  searchUrl: z.string().optional(),
  metrics: z
    .object({
      impressionsCount: z.number().optional(),
    })
    .optional(),
});

// ── Internal helpers ──────────────────────────────────────────────────────────

interface GBPErrorBody {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

async function gbpFetch<T>(
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

  if (response.status === 204) {
    return undefined as unknown as T;
  }

  const data: unknown = await response.json();

  if (!response.ok) {
    const err = data as GBPErrorBody;
    const msg = err.error?.message ?? response.statusText;
    throw new Error(
      `Google Business Profile API error (${response.status}): ${msg}`
    );
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `GBP API response validation failed: ${parsed.error.message}`
    );
  }

  return parsed.data;
}

// ── Google Business Profile Adapter ──────────────────────────────────────────

export class GoogleBusinessAdapter implements PlatformAdapter {
  /**
   * Publish a Local Post to Google Business Profile.
   * Supports NONE (text only) and IMAGE (text + photo) posts.
   * VIDEO and CAROUSEL are not supported by the GBP Local Posts API.
   */
  async publish(post: PostContent, encryptedToken: string): Promise<PublishResult> {
    const { accessToken, locationName } =
      parseGoogleBusinessToken(encryptedToken);

    const content = post.content.slice(0, GBP_TEXT_LIMIT);

    if (post.mediaType === MediaType.VIDEO || post.mediaType === MediaType.CAROUSEL) {
      throw new Error(
        `Google Business Profile does not support ${post.mediaType} posts. Use NONE or IMAGE.`
      );
    }

    const body: Record<string, unknown> = {
      languageCode: "en-US",
      summary: content,
      topicType: "STANDARD",
    };

    if (
      post.mediaType === MediaType.IMAGE &&
      post.mediaUrls.length > 0
    ) {
      body.media = [
        {
          mediaFormat: "PHOTO",
          sourceUrl: post.mediaUrls[0],
        },
      ];
    }

    const url = `${GBP_API_BASE}/${locationName}/localPosts`;
    const result = await gbpFetch(url, localPostResponseSchema, accessToken, {
      method: "POST",
      body: JSON.stringify(body),
    });

    return {
      platformPostId: result.name,
      publishedUrl: result.searchUrl,
    };
  }

  /**
   * Fetch the current status of a local post by its resource name.
   */
  async getStatus(
    platformPostId: string,
    encryptedToken: string
  ): Promise<PostStatus> {
    const { accessToken } = parseGoogleBusinessToken(encryptedToken);

    try {
      const url = `${GBP_API_BASE}/${platformPostId}`;
      const post = await gbpFetch(url, localPostGetSchema, accessToken);

      switch (post.state) {
        case "LIVE":
          return "PUBLISHED";
        case "REJECTED":
          return "FAILED";
        default:
          return "PUBLISHED";
      }
    } catch {
      return "FAILED";
    }
  }

  /**
   * Delete a local post by its resource name.
   */
  async deletePost(
    platformPostId: string,
    encryptedToken: string
  ): Promise<void> {
    const { accessToken } = parseGoogleBusinessToken(encryptedToken);

    const response = await fetch(
      `${GBP_API_BASE}/${platformPostId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok && response.status !== 404) {
      const data: unknown = await response.json().catch(() => ({}));
      const err = data as GBPErrorBody;
      const msg = err.error?.message ?? response.statusText;
      throw new Error(
        `Google Business Profile delete error (${response.status}): ${msg}`
      );
    }
  }

  /**
   * Google Business Profile Local Posts API does not expose rich engagement
   * metrics, so we return zeros.
   */
  async getInsights(
    _platformPostId: string,
    _encryptedToken: string
  ): Promise<Insights> {
    return {
      impressions: 0,
      reach: 0,
      likes: 0,
      comments: 0,
      shares: 0,
    };
  }
}

export const googleBusinessAdapter = new GoogleBusinessAdapter();
