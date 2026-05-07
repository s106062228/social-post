import { z } from "zod";
import { MediaType } from "@prisma/client";
import {
  PostContent,
  PublishResult,
  PostStatus,
  Insights,
  PlatformAdapter,
} from "./types";
import { parseMediumToken } from "@/lib/auth/medium-oauth";

const MEDIUM_API_BASE = "https://api.medium.com/v1";
const MEDIUM_TEXT_LIMIT = 100000;

// ── Zod schemas ───────────────────────────────────────────────────────────────

const createPostResponseSchema = z.object({
  data: z.object({
    id: z.string(),
    url: z.string().optional(),
    canonicalUrl: z.string().optional(),
  }),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

interface MediumErrorBody {
  errors?: Array<{ message?: string; code?: number }>;
}

async function mediumApiFetch<T>(
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
      Accept: "application/json",
      ...(options?.headers ?? {}),
    },
  });

  const data: unknown = await response.json();

  if (!response.ok) {
    const err = data as MediumErrorBody;
    const detail = err.errors?.[0]?.message ?? response.statusText;
    throw new Error(`Medium API error (${response.status}): ${detail}`);
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Medium API response validation failed: ${parsed.error.message}`
    );
  }

  return parsed.data;
}

// ── Medium Adapter ────────────────────────────────────────────────────────────

export class MediumAdapter implements PlatformAdapter {
  /**
   * Publish a post to Medium via the API v1.
   * Supports NONE (text/HTML story) and IMAGE (HTML story with embedded image).
   * VIDEO and CAROUSEL are unsupported.
   * The token is a serialized MediumToken JSON.
   */
  async publish(
    post: PostContent,
    accountId: string,
    token: string
  ): Promise<PublishResult> {
    void accountId;

    if (
      post.mediaType === MediaType.VIDEO ||
      post.mediaType === MediaType.CAROUSEL
    ) {
      throw new Error(
        `Medium adapter does not support ${post.mediaType} posts`
      );
    }

    const mediumToken = parseMediumToken(token);
    const { accessToken, authorId } = mediumToken;

    const content = post.content.slice(0, MEDIUM_TEXT_LIMIT);

    // First line becomes title, rest becomes body
    const newlineIdx = content.indexOf("\n");
    const title =
      newlineIdx > 0
        ? content.slice(0, newlineIdx).trim()
        : content.slice(0, 200).trim();
    const body = newlineIdx > 0 ? content.slice(newlineIdx + 1).trim() : "";

    // Build HTML story content
    let htmlContent = `<h1>${title}</h1>`;
    if (body) {
      htmlContent += `<p>${body.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br />")}</p>`;
    }

    // Embed image if provided
    if (post.mediaType === MediaType.IMAGE && post.mediaUrls.length > 0) {
      htmlContent += `<figure><img src="${post.mediaUrls[0]}" /></figure>`;
    }

    const result = await mediumApiFetch(
      `${MEDIUM_API_BASE}/users/${authorId}/posts`,
      createPostResponseSchema,
      accessToken,
      {
        method: "POST",
        body: JSON.stringify({
          title,
          contentFormat: "html",
          content: htmlContent,
          publishStatus: "public",
        }),
      }
    );

    return {
      platformPostId: result.data.id,
      publishedAt: new Date(),
      publishedUrl: result.data.url ?? result.data.canonicalUrl ?? "",
    };
  }

  async getStatus(platformPostId: string, _token: string): Promise<PostStatus> {
    // Medium's public API does not expose a per-post status endpoint;
    // once published the post is live.
    void platformPostId;
    return { status: "PUBLISHED" };
  }

  async deletePost(_platformPostId: string, _token: string): Promise<void> {
    // Medium's API does not expose a public post delete endpoint.
    return;
  }

  async getInsights(
    _platformPostId: string,
    _token: string
  ): Promise<Insights> {
    // Medium's stats API is not publicly available.
    return {};
  }
}

export const mediumAdapter = new MediumAdapter();
