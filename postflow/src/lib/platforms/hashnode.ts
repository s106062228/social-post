import { z } from "zod";
import { MediaType } from "@prisma/client";
import {
  PostContent,
  PublishResult,
  PostStatus,
  Insights,
  PlatformAdapter,
} from "./types";
import { parseHashnodeToken } from "@/lib/auth/hashnode-oauth";

const HASHNODE_GQL_ENDPOINT = "https://gql.hashnode.com";
const HASHNODE_TEXT_LIMIT = 40000;

// ── Zod schemas ───────────────────────────────────────────────────────────────

const publishPostResponseSchema = z.object({
  data: z.object({
    publishPost: z.object({
      post: z.object({
        id: z.string(),
        url: z.string(),
        slug: z.string().optional(),
        title: z.string(),
      }),
    }),
  }),
});

const getPostResponseSchema = z.object({
  data: z.object({
    post: z
      .object({
        id: z.string(),
        url: z.string().optional().nullable(),
        replyCount: z.number().optional().nullable(),
        reactionCount: z.number().optional().nullable(),
        views: z.number().optional().nullable(),
      })
      .nullable(),
  }),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function hashnodeGql<T>(
  query: string,
  variables: Record<string, unknown>,
  schema: z.ZodType<T>,
  apiToken: string
): Promise<T> {
  const response = await fetch(HASHNODE_GQL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: apiToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Hashnode API error (${response.status}): ${text}`);
  }

  const data: unknown = await response.json();

  // Propagate GraphQL-level errors
  const errCheck = data as { errors?: { message: string }[] };
  if (errCheck.errors && errCheck.errors.length > 0) {
    throw new Error(
      `Hashnode GraphQL error: ${errCheck.errors[0]?.message ?? "Unknown error"}`
    );
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Hashnode API response validation failed: ${parsed.error.message}`
    );
  }
  return parsed.data;
}

function extractTitleAndBody(
  post: PostContent
): { title: string; body: string } {
  const content = post.content.slice(0, HASHNODE_TEXT_LIMIT);

  const newlineIdx = content.indexOf("\n");
  const title =
    newlineIdx > 0
      ? content.slice(0, newlineIdx).trim()
      : content.slice(0, 255).trim();
  let body = newlineIdx > 0 ? content.slice(newlineIdx + 1).trim() : "";

  if (post.mediaType === MediaType.IMAGE && post.mediaUrls.length > 0) {
    const imageMarkdown = post.mediaUrls
      .map((url, i) => `![image-${i + 1}](${url})`)
      .join("\n");
    body = body ? `${imageMarkdown}\n\n${body}` : imageMarkdown;
  }

  return { title, body };
}

// ── Hashnode Adapter ──────────────────────────────────────────────────────────

export class HashnodeAdapter implements PlatformAdapter {
  /**
   * Publish a post to Hashnode via the GraphQL API.
   * Supports NONE (text/Markdown article) and IMAGE (with embedded image URLs).
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
        `Hashnode adapter does not support ${post.mediaType} posts`
      );
    }

    const hashnodeToken = parseHashnodeToken(token);
    const { apiToken, publicationId } = hashnodeToken;

    const { title, body } = extractTitleAndBody(post);

    const mutation = `
      mutation PublishPost($input: PublishPostInput!) {
        publishPost(input: $input) {
          post {
            id
            url
            slug
            title
          }
        }
      }
    `;

    const variables = {
      input: {
        title,
        contentMarkdown: body || title,
        publicationId,
        tags: [],
      },
    };

    const result = await hashnodeGql(
      mutation,
      variables,
      publishPostResponseSchema,
      apiToken
    );

    const publishedPost = result.data.publishPost.post;

    return {
      platformPostId: publishedPost.id,
      publishedAt: new Date(),
      publishedUrl: publishedPost.url,
    };
  }

  async getStatus(platformPostId: string, token: string): Promise<PostStatus> {
    const hashnodeToken = parseHashnodeToken(token);
    const { apiToken } = hashnodeToken;

    const query = `
      query GetPost($id: ID!) {
        post(id: $id) {
          id
          url
          replyCount
          reactionCount
          views
        }
      }
    `;

    try {
      const result = await hashnodeGql(
        query,
        { id: platformPostId },
        getPostResponseSchema,
        apiToken
      );

      if (!result.data.post) {
        return { status: "FAILED" };
      }

      return { status: "PUBLISHED" };
    } catch {
      return { status: "FAILED" };
    }
  }

  async deletePost(platformPostId: string, token: string): Promise<void> {
    const hashnodeToken = parseHashnodeToken(token);
    const { apiToken } = hashnodeToken;

    const mutation = `
      mutation RemovePost($id: ID!) {
        removePost(id: $id) {
          post {
            id
          }
        }
      }
    `;

    const response = await fetch(HASHNODE_GQL_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: apiToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: mutation, variables: { id: platformPostId } }),
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(
        `Hashnode delete error (${response.status}): ${response.statusText}`
      );
    }
  }

  async getInsights(
    platformPostId: string,
    token: string
  ): Promise<Insights> {
    const hashnodeToken = parseHashnodeToken(token);
    const { apiToken } = hashnodeToken;

    const query = `
      query GetPost($id: ID!) {
        post(id: $id) {
          id
          url
          replyCount
          reactionCount
          views
        }
      }
    `;

    try {
      const result = await hashnodeGql(
        query,
        { id: platformPostId },
        getPostResponseSchema,
        apiToken
      );

      const postData = result.data.post;
      if (!postData) {
        return {};
      }

      return {
        impressions: postData.views ?? 0,
        likes: postData.reactionCount ?? 0,
        comments: postData.replyCount ?? 0,
      };
    } catch {
      return {};
    }
  }
}

export const hashnodeAdapter = new HashnodeAdapter();
