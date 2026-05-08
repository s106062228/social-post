import { z } from "zod";
import { MediaType } from "@prisma/client";
import {
  PostContent,
  PublishResult,
  PostStatus,
  Insights,
  PlatformAdapter,
} from "./types";
import { generateGhostJwt, parseGhostToken } from "@/lib/auth/ghost-oauth";

const GHOST_ADMIN_API_VERSION = "v5.0";
const GHOST_TEXT_LIMIT = 100000;

// ── Zod schemas ───────────────────────────────────────────────────────────────

const createPostResponseSchema = z.object({
  posts: z.array(
    z.object({
      id: z.string(),
      url: z.string().optional().nullable(),
      status: z.string().optional(),
    })
  ),
});

const getPostResponseSchema = z.object({
  posts: z.array(
    z.object({
      id: z.string(),
      status: z.string(),
      url: z.string().optional().nullable(),
    })
  ),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

interface GhostErrorBody {
  errors?: Array<{ message?: string; type?: string }>;
}

async function ghostApiFetch<T>(
  url: string,
  schema: z.ZodType<T>,
  jwt: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Ghost ${jwt}`,
      "Content-Type": "application/json",
      "Accept-Version": GHOST_ADMIN_API_VERSION,
      ...(options?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const err = (await response.json()) as GhostErrorBody;
      detail = err.errors?.[0]?.message ?? detail;
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(`Ghost API error (${response.status}): ${detail}`);
  }

  const data: unknown = await response.json();
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`Ghost API response validation failed: ${parsed.error.message}`);
  }
  return parsed.data;
}

function ghostStatusToPostStatus(ghostStatus: string): "PUBLISHED" | "PENDING" | "FAILED" {
  switch (ghostStatus) {
    case "published":
      return "PUBLISHED";
    case "scheduled":
      return "PENDING";
    default:
      // draft or unknown states are treated as pending
      return "PENDING";
  }
}

// ── Ghost Adapter ─────────────────────────────────────────────────────────────

export class GhostAdapter implements PlatformAdapter {
  /**
   * Publish a post to Ghost CMS via the Admin API.
   * Supports NONE (text/HTML post) and IMAGE (post with featured image).
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
        `Ghost adapter does not support ${post.mediaType} posts`
      );
    }

    const ghostToken = parseGhostToken(token);
    const { instanceUrl, adminApiKey } = ghostToken;
    const normalizedUrl = instanceUrl.replace(/\/$/, "");

    const content = post.content.slice(0, GHOST_TEXT_LIMIT);

    // Split first line as title, remainder as body
    const newlineIdx = content.indexOf("\n");
    const title =
      newlineIdx > 0
        ? content.slice(0, newlineIdx).trim()
        : content.slice(0, 255).trim();
    const body = newlineIdx > 0 ? content.slice(newlineIdx + 1).trim() : "";

    // Build Lexical/mobiledoc HTML content
    const htmlContent = body
      ? `<p>${body.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br />")}</p>`
      : "";

    const postPayload: Record<string, unknown> = {
      title,
      html: htmlContent,
      status: "published",
    };

    // Set featured image if provided
    if (post.mediaType === MediaType.IMAGE && post.mediaUrls.length > 0) {
      postPayload.feature_image = post.mediaUrls[0];
    }

    const jwt = generateGhostJwt(adminApiKey);
    const result = await ghostApiFetch(
      `${normalizedUrl}/ghost/api/admin/posts/`,
      createPostResponseSchema,
      jwt,
      {
        method: "POST",
        body: JSON.stringify({ posts: [postPayload] }),
      }
    );

    const createdPost = result.posts[0];
    if (!createdPost) {
      throw new Error("Ghost API returned empty posts array");
    }

    return {
      platformPostId: createdPost.id,
      publishedAt: new Date(),
      publishedUrl: createdPost.url ?? "",
    };
  }

  async getStatus(platformPostId: string, token: string): Promise<PostStatus> {
    const ghostToken = parseGhostToken(token);
    const { instanceUrl, adminApiKey } = ghostToken;
    const normalizedUrl = instanceUrl.replace(/\/$/, "");

    try {
      const jwt = generateGhostJwt(adminApiKey);
      const result = await ghostApiFetch(
        `${normalizedUrl}/ghost/api/admin/posts/${platformPostId}/`,
        getPostResponseSchema,
        jwt
      );

      const post = result.posts[0];
      if (!post) {
        return { status: "FAILED" };
      }

      return { status: ghostStatusToPostStatus(post.status ?? "draft") };
    } catch {
      return { status: "FAILED" };
    }
  }

  async deletePost(platformPostId: string, token: string): Promise<void> {
    const ghostToken = parseGhostToken(token);
    const { instanceUrl, adminApiKey } = ghostToken;
    const normalizedUrl = instanceUrl.replace(/\/$/, "");

    const jwt = generateGhostJwt(adminApiKey);
    const response = await fetch(
      `${normalizedUrl}/ghost/api/admin/posts/${platformPostId}/`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Ghost ${jwt}`,
          "Accept-Version": GHOST_ADMIN_API_VERSION,
        },
      }
    );

    if (!response.ok && response.status !== 404) {
      throw new Error(`Ghost delete error (${response.status}): ${response.statusText}`);
    }
  }

  async getInsights(
    _platformPostId: string,
    _token: string
  ): Promise<Insights> {
    // Ghost Admin API does not expose per-post engagement metrics publicly.
    return {};
  }
}

export const ghostAdapter = new GhostAdapter();
