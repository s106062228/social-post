import { z } from "zod";
import { MediaType } from "@prisma/client";
import {
  PostContent,
  PublishResult,
  PostStatus,
  Insights,
  PlatformAdapter,
} from "./types";
import { parseWordPressToken } from "@/lib/auth/wordpress-oauth";

const WORDPRESS_API_BASE = "https://public-api.wordpress.com/rest/v1.1";
const WORDPRESS_TEXT_LIMIT = 200000;

// ── Zod schemas ───────────────────────────────────────────────────────────────

const createPostResponseSchema = z.object({
  ID: z.number(),
  URL: z.string().optional(),
  short_URL: z.string().optional(),
  status: z.string().optional(),
});

const postInfoResponseSchema = z.object({
  ID: z.number().optional(),
  URL: z.string().optional(),
  status: z.string().optional(),
  like_count: z.number().optional(),
  comment_count: z.number().optional(),
});

const mediaUploadResponseSchema = z.object({
  media: z.array(
    z.object({
      ID: z.number(),
      URL: z.string(),
    })
  ),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

interface WordPressErrorBody {
  error?: string;
  message?: string;
}

async function wordpressApiFetch<T>(
  url: string,
  schema: z.ZodType<T>,
  accessToken: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options?.headers ?? {}),
    },
  });

  const data: unknown = await response.json();

  if (!response.ok) {
    const err = data as WordPressErrorBody;
    const detail = err.message ?? err.error ?? response.statusText;
    throw new Error(`WordPress API error (${response.status}): ${detail}`);
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `WordPress API response validation failed: ${parsed.error.message}`
    );
  }

  return parsed.data;
}

async function uploadMediaFromUrl(
  siteId: string,
  imageUrl: string,
  accessToken: string
): Promise<string> {
  // Fetch the image bytes
  const imageResp = await fetch(imageUrl);
  if (!imageResp.ok) {
    throw new Error(`Failed to fetch image from ${imageUrl}: ${imageResp.status}`);
  }
  const imageBuffer = await imageResp.arrayBuffer();
  const contentType = imageResp.headers.get("content-type") ?? "image/jpeg";

  // Upload as multipart form data
  const formData = new FormData();
  const blob = new Blob([imageBuffer], { type: contentType });
  const ext = contentType.split("/")[1] ?? "jpg";
  formData.append("media[]", blob, `upload.${ext}`);

  const uploadResp = await fetch(
    `${WORDPRESS_API_BASE}/sites/${siteId}/media/new`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData,
    }
  );

  const uploadData: unknown = await uploadResp.json();
  if (!uploadResp.ok) {
    const err = uploadData as WordPressErrorBody;
    throw new Error(
      `WordPress media upload error (${uploadResp.status}): ${err.message ?? uploadResp.statusText}`
    );
  }

  const parsed = mediaUploadResponseSchema.safeParse(uploadData);
  if (!parsed.success || !parsed.data.media[0]) {
    throw new Error("WordPress media upload: unexpected response shape");
  }

  return String(parsed.data.media[0].ID);
}

// ── WordPress Adapter ──────────────────────────────────────────────────────────

export class WordPressAdapter implements PlatformAdapter {
  /**
   * Publish a post to WordPress.com via the REST API v1.1.
   * Supports NONE (text post) and IMAGE (post with featured image).
   * VIDEO and CAROUSEL are unsupported.
   * The token is a serialized WordPressToken JSON.
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
        `WordPress adapter does not support ${post.mediaType} posts`
      );
    }

    const wpToken = parseWordPressToken(token);
    const { accessToken, siteId } = wpToken;

    // Use first 200 chars of content as title, rest as body
    const content = post.content.slice(0, WORDPRESS_TEXT_LIMIT);
    const titleEnd = content.indexOf("\n");
    const title =
      titleEnd > 0 ? content.slice(0, titleEnd).trim() : content.slice(0, 200).trim();
    const body = titleEnd > 0 ? content.slice(titleEnd + 1).trim() : "";

    const postBody: Record<string, unknown> = {
      title,
      content: body || content,
      status: "publish",
    };

    // Upload featured image if provided
    if (post.mediaType === MediaType.IMAGE && post.mediaUrls.length > 0) {
      const mediaId = await uploadMediaFromUrl(
        siteId,
        post.mediaUrls[0],
        accessToken
      );
      postBody.featured_image = mediaId;
    }

    const result = await wordpressApiFetch(
      `${WORDPRESS_API_BASE}/sites/${siteId}/posts/new`,
      createPostResponseSchema,
      accessToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(postBody),
      }
    );

    const postId = String(result.ID);
    const postUrl = result.URL ?? result.short_URL ?? "";

    return {
      platformPostId: postId,
      publishedAt: new Date(),
      publishedUrl: postUrl,
    };
  }

  async getStatus(platformPostId: string, token: string): Promise<PostStatus> {
    try {
      const wpToken = parseWordPressToken(token);

      const data = await wordpressApiFetch(
        `${WORDPRESS_API_BASE}/sites/${wpToken.siteId}/posts/${platformPostId}`,
        postInfoResponseSchema,
        wpToken.accessToken
      );

      if (!data.ID) {
        return { status: "FAILED", error: "Post not found" };
      }

      const status = data.status;
      if (status === "publish") return { status: "PUBLISHED" };
      if (status === "draft" || status === "pending") return { status: "PENDING" };

      return { status: "PUBLISHED" };
    } catch (err) {
      return {
        status: "FAILED",
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  async deletePost(platformPostId: string, token: string): Promise<void> {
    const wpToken = parseWordPressToken(token);

    const response = await fetch(
      `${WORDPRESS_API_BASE}/sites/${wpToken.siteId}/posts/${platformPostId}/delete`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${wpToken.accessToken}` },
      }
    );

    if (!response.ok && response.status !== 404) {
      throw new Error(
        `WordPress delete error (${response.status}): ${response.statusText}`
      );
    }
  }

  async getInsights(
    platformPostId: string,
    token: string
  ): Promise<Insights> {
    try {
      const wpToken = parseWordPressToken(token);

      const data = await wordpressApiFetch(
        `${WORDPRESS_API_BASE}/sites/${wpToken.siteId}/posts/${platformPostId}`,
        postInfoResponseSchema,
        wpToken.accessToken
      );

      if (!data.ID) return {};

      return {
        likes: data.like_count,
        comments: data.comment_count,
      };
    } catch {
      return {};
    }
  }
}

export const wordpressAdapter = new WordPressAdapter();
