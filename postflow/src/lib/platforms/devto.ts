import { z } from "zod";
import { MediaType } from "@prisma/client";
import {
  PostContent,
  PublishResult,
  PostStatus,
  Insights,
  PlatformAdapter,
} from "./types";
import { parseDevToToken } from "@/lib/auth/devto-oauth";

const DEVTO_API_BASE = "https://dev.to/api";
const DEVTO_TEXT_LIMIT = 100000;

// ── Zod schemas ───────────────────────────────────────────────────────────────

const createArticleResponseSchema = z.object({
  id: z.number(),
  url: z.string(),
  slug: z.string().optional(),
  published: z.boolean().optional(),
});

const getArticleResponseSchema = z.object({
  id: z.number(),
  url: z.string().optional().nullable(),
  published: z.boolean().optional().nullable(),
  public_reactions_count: z.number().optional().nullable(),
  comments_count: z.number().optional().nullable(),
  page_views_count: z.number().optional().nullable(),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function devtoApiFetch<T>(
  path: string,
  schema: z.ZodType<T>,
  apiKey: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${DEVTO_API_BASE}${path}`, {
    ...options,
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Dev.to API error (${response.status}): ${text}`);
  }

  const data: unknown = await response.json();
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`Dev.to API response validation failed: ${parsed.error.message}`);
  }
  return parsed.data;
}

// ── Dev.to Adapter ─────────────────────────────────────────────────────────────

export class DevToAdapter implements PlatformAdapter {
  /**
   * Publish a post to Dev.to via the Articles API.
   * Supports NONE (text/Markdown article) and IMAGE (article with embedded image URL in Markdown).
   * VIDEO and CAROUSEL are unsupported.
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
        `Dev.to adapter does not support ${post.mediaType} posts`
      );
    }

    const devtoToken = parseDevToToken(token);
    const { apiKey } = devtoToken;

    const content = post.content.slice(0, DEVTO_TEXT_LIMIT);

    // Extract first line as title; remaining lines as body
    const newlineIdx = content.indexOf("\n");
    const title =
      newlineIdx > 0
        ? content.slice(0, newlineIdx).trim()
        : content.slice(0, 255).trim();
    const body = newlineIdx > 0 ? content.slice(newlineIdx + 1).trim() : "";

    // Build Markdown body with optional image embed
    let markdownBody = body;
    if (post.mediaType === MediaType.IMAGE && post.mediaUrls.length > 0) {
      const imageMarkdown = post.mediaUrls
        .map((url, i) => `![image-${i + 1}](${url})`)
        .join("\n");
      markdownBody = markdownBody
        ? `${imageMarkdown}\n\n${markdownBody}`
        : imageMarkdown;
    }

    const articlePayload = {
      article: {
        title,
        body_markdown: markdownBody,
        published: true,
      },
    };

    const result = await devtoApiFetch(
      "/articles",
      createArticleResponseSchema,
      apiKey,
      {
        method: "POST",
        body: JSON.stringify(articlePayload),
      }
    );

    return {
      platformPostId: String(result.id),
      publishedAt: new Date(),
      publishedUrl: result.url,
    };
  }

  async getStatus(platformPostId: string, token: string): Promise<PostStatus> {
    const devtoToken = parseDevToToken(token);
    const { apiKey } = devtoToken;

    try {
      const result = await devtoApiFetch(
        `/articles/${platformPostId}`,
        getArticleResponseSchema,
        apiKey
      );

      if (result.published === false) {
        return { status: "PENDING" };
      }
      return { status: "PUBLISHED" };
    } catch {
      return { status: "FAILED" };
    }
  }

  async deletePost(platformPostId: string, token: string): Promise<void> {
    // Dev.to does not expose a public delete endpoint for articles via the API.
    // Unpublish instead by setting published=false.
    const devtoToken = parseDevToToken(token);
    const { apiKey } = devtoToken;

    const response = await fetch(`${DEVTO_API_BASE}/articles/${platformPostId}`, {
      method: "PUT",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ article: { published: false } }),
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`Dev.to unpublish error (${response.status}): ${response.statusText}`);
    }
  }

  async getInsights(
    platformPostId: string,
    token: string
  ): Promise<Insights> {
    const devtoToken = parseDevToToken(token);
    const { apiKey } = devtoToken;

    try {
      const result = await devtoApiFetch(
        `/articles/${platformPostId}`,
        getArticleResponseSchema,
        apiKey
      );

      return {
        likes: result.public_reactions_count ?? 0,
        comments: result.comments_count ?? 0,
        impressions: result.page_views_count ?? 0,
      };
    } catch {
      return {};
    }
  }
}

export const devtoAdapter = new DevToAdapter();
