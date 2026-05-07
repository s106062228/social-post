import { z } from "zod";
import { MediaType } from "@prisma/client";
import {
  PostContent,
  PublishResult,
  PostStatus,
  Insights,
  PlatformAdapter,
} from "./types";
import { parseTumblrToken } from "@/lib/auth/tumblr-oauth";

const TUMBLR_API_BASE = "https://api.tumblr.com/v2";
const TUMBLR_TEXT_LIMIT = 4096;

// ── Zod schemas ───────────────────────────────────────────────────────────────

const createPostResponseSchema = z.object({
  meta: z.object({ status: z.number(), msg: z.string() }),
  response: z.object({
    id: z.union([z.string(), z.number()]).optional(),
    id_string: z.string().optional(),
    post_url: z.string().optional(),
  }),
});

const postInfoResponseSchema = z.object({
  meta: z.object({ status: z.number(), msg: z.string() }),
  response: z
    .object({
      id: z.union([z.string(), z.number()]).optional(),
      id_string: z.string().optional(),
      post_url: z.string().optional(),
      state: z.string().optional(),
      note_count: z.number().optional(),
    })
    .optional(),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

interface TumblrErrorBody {
  meta?: { status?: number; msg?: string };
  errors?: Array<{ code?: number; title?: string; detail?: string }>;
}

async function tumblrApiFetch<T>(
  url: string,
  schema: z.ZodType<T>,
  accessToken: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });

  const data: unknown = await response.json();

  if (!response.ok) {
    const err = data as TumblrErrorBody;
    const detail =
      err.errors?.[0]?.detail ??
      err.errors?.[0]?.title ??
      err.meta?.msg ??
      response.statusText;
    throw new Error(`Tumblr API error (${response.status}): ${detail}`);
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Tumblr API response validation failed: ${parsed.error.message}`
    );
  }

  return parsed.data;
}

// ── Tumblr Adapter ─────────────────────────────────────────────────────────────

export class TumblrAdapter implements PlatformAdapter {
  /**
   * Publish a post to Tumblr via the Tumblr API v2.
   * Supports NONE (text post) and IMAGE (photo post).
   * VIDEO and CAROUSEL are unsupported.
   * The token is a serialized TumblrToken JSON.
   */
  async publish(
    post: PostContent,
    accountId: string,
    token: string
  ): Promise<PublishResult> {
    if (
      post.mediaType === MediaType.VIDEO ||
      post.mediaType === MediaType.CAROUSEL
    ) {
      throw new Error(
        `Tumblr adapter does not support ${post.mediaType} posts`
      );
    }

    const tumblrToken = parseTumblrToken(token);
    const { accessToken } = tumblrToken;

    // Use the primary blog; accountId may be overridden per-account
    const blogIdentifier = tumblrToken.primaryBlog;

    const content = post.content.slice(0, TUMBLR_TEXT_LIMIT);

    let body: Record<string, unknown>;

    if (post.mediaType === MediaType.IMAGE && post.mediaUrls.length > 0) {
      // Photo post — use NPF (Neue Post Format)
      body = {
        content: [
          ...post.mediaUrls.map((url) => ({
            type: "image",
            media: [{ type: "image/jpeg", url }],
            alt_text: content,
          })),
          ...(content
            ? [{ type: "text", text: content }]
            : []),
        ],
      };
    } else {
      // Text post — NPF text block
      body = {
        content: [{ type: "text", text: content }],
      };
    }

    const result = await tumblrApiFetch(
      `${TUMBLR_API_BASE}/blog/${blogIdentifier}/posts`,
      createPostResponseSchema,
      accessToken,
      { method: "POST", body: JSON.stringify(body) }
    );

    const postId =
      result.response.id_string ??
      String(result.response.id ?? "");
    const postUrl =
      result.response.post_url ??
      `https://www.tumblr.com/blog/view/${blogIdentifier}/${postId}`;

    return {
      platformPostId: postId,
      publishedAt: new Date(),
      publishedUrl: postUrl,
    };
  }

  async getStatus(platformPostId: string, token: string): Promise<PostStatus> {
    try {
      const tumblrToken = parseTumblrToken(token);
      const blogIdentifier = tumblrToken.primaryBlog;

      const data = await tumblrApiFetch(
        `${TUMBLR_API_BASE}/blog/${blogIdentifier}/posts/${platformPostId}`,
        postInfoResponseSchema,
        tumblrToken.accessToken
      );

      if (!data.response) {
        return { status: "FAILED", error: "Post not found" };
      }

      const state = data.response.state;
      if (state === "published") return { status: "PUBLISHED" };
      if (state === "queued" || state === "draft") return { status: "PENDING" };

      return { status: "PUBLISHED" };
    } catch (err) {
      return {
        status: "FAILED",
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  async deletePost(platformPostId: string, token: string): Promise<void> {
    const tumblrToken = parseTumblrToken(token);
    const blogIdentifier = tumblrToken.primaryBlog;

    const response = await fetch(
      `${TUMBLR_API_BASE}/blog/${blogIdentifier}/post/delete`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tumblrToken.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: platformPostId }),
      }
    );

    if (!response.ok && response.status !== 404) {
      throw new Error(
        `Tumblr delete error (${response.status}): ${response.statusText}`
      );
    }
  }

  async getInsights(
    platformPostId: string,
    token: string
  ): Promise<Insights> {
    try {
      const tumblrToken = parseTumblrToken(token);
      const blogIdentifier = tumblrToken.primaryBlog;

      const data = await tumblrApiFetch(
        `${TUMBLR_API_BASE}/blog/${blogIdentifier}/posts/${platformPostId}`,
        postInfoResponseSchema,
        tumblrToken.accessToken
      );

      if (!data.response) return {};

      return {
        likes: data.response.note_count,
      };
    } catch {
      return {};
    }
  }
}

export const tumblrAdapter = new TumblrAdapter();
