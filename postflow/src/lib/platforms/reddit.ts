import { z } from "zod";
import { MediaType } from "@prisma/client";
import {
  PostContent,
  PublishResult,
  PostStatus,
  Insights,
  PlatformAdapter,
} from "./types";
import { parseRedditToken } from "@/lib/auth/reddit-oauth";

const REDDIT_OAUTH_API = "https://oauth.reddit.com";
const REDDIT_TITLE_LIMIT = 300;
const REDDIT_TEXT_LIMIT = 40000;

// ── Zod schemas ───────────────────────────────────────────────────────────────

const submitResponseSchema = z.object({
  json: z.object({
    data: z.object({
      id: z.string().optional(),
      name: z.string().optional(),
      url: z.string().optional(),
    }),
    errors: z.array(z.unknown()).optional(),
  }),
});

const postLookupResponseSchema = z.object({
  data: z.object({
    children: z.array(
      z.object({
        data: z.object({
          id: z.string(),
          name: z.string(),
          removed_by_category: z.string().nullable().optional(),
          score: z.number().optional(),
          ups: z.number().optional(),
          upvote_ratio: z.number().optional(),
          num_comments: z.number().optional(),
          view_count: z.number().nullable().optional(),
        }),
      })
    ),
  }),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

interface RedditErrorBody {
  message?: string;
  error?: string;
}

async function redditApiFetch<T>(
  url: string,
  schema: z.ZodType<T>,
  accessToken: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "PostFlow/1.0",
      "Content-Type": "application/x-www-form-urlencoded",
      ...(options?.headers ?? {}),
    },
  });

  const data: unknown = await response.json();

  if (!response.ok) {
    const err = data as RedditErrorBody;
    throw new Error(
      `Reddit API error (${response.status}): ${err.message ?? err.error ?? response.statusText}`
    );
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Reddit API response validation failed: ${parsed.error.message}`
    );
  }

  return parsed.data;
}

function extractSubreddit(accountId: string): string {
  // accountId may be stored as "username|subreddit" or just username
  // In the callback we store the reddit user id as accountId, and subreddit
  // is passed via the post content title/accountId hint.
  // For posting, the subreddit must be embedded in the post metadata or
  // we fall back to the first moderated subreddit from the stored token.
  return accountId;
}

function extractTitleAndBody(content: string): {
  title: string;
  body: string;
} {
  // First line (up to 300 chars) becomes the title; rest is body
  const newlineIdx = content.indexOf("\n");
  if (newlineIdx !== -1 && newlineIdx <= REDDIT_TITLE_LIMIT) {
    const title = content.slice(0, newlineIdx).trim();
    const body = content.slice(newlineIdx + 1).trim();
    return { title: title.slice(0, REDDIT_TITLE_LIMIT), body: body.slice(0, REDDIT_TEXT_LIMIT) };
  }

  if (content.length <= REDDIT_TITLE_LIMIT) {
    return { title: content.trim(), body: "" };
  }

  // Long single line: split at limit
  return {
    title: content.slice(0, REDDIT_TITLE_LIMIT).trim(),
    body: content.slice(REDDIT_TITLE_LIMIT).trim().slice(0, REDDIT_TEXT_LIMIT),
  };
}

// ── Reddit Adapter ────────────────────────────────────────────────────────────

export class RedditAdapter implements PlatformAdapter {
  /**
   * Publish a post to Reddit via the Reddit OAuth API.
   * Supports NONE (self/text post) and IMAGE (link post using the image URL).
   * The token is a serialized RedditToken JSON; accountId is the Reddit user id.
   * The subreddit is taken from the first moderated subreddit stored in the token,
   * or from a "subreddit:<name>" prefix in accountId if provided.
   */
  async publish(
    post: PostContent,
    accountId: string,
    token: string
  ): Promise<PublishResult> {
    if (
      post.mediaType !== MediaType.NONE &&
      post.mediaType !== MediaType.IMAGE
    ) {
      throw new Error(
        `Reddit adapter supports NONE and IMAGE posts, got ${post.mediaType}`
      );
    }

    const redditToken = parseRedditToken(token);
    const accessToken = redditToken.accessToken;

    // Determine target subreddit
    let subreddit: string;
    if (accountId.startsWith("subreddit:")) {
      subreddit = accountId.replace("subreddit:", "");
    } else if (redditToken.subreddits.length > 0) {
      subreddit = redditToken.subreddits[0];
    } else {
      // Fall back to user's own profile subreddit
      subreddit = `u_${redditToken.username}`;
    }

    const { title, body } = extractTitleAndBody(post.content);

    let kind: string;
    let formBody: URLSearchParams;

    if (post.mediaType === MediaType.IMAGE && post.mediaUrls.length > 0) {
      // Link post: submit the image URL
      kind = "link";
      formBody = new URLSearchParams({
        sr: subreddit,
        kind,
        title,
        url: post.mediaUrls[0],
        resubmit: "true",
        nsfw: "false",
        spoiler: "false",
      });
    } else {
      // Self (text) post
      kind = "self";
      formBody = new URLSearchParams({
        sr: subreddit,
        kind,
        title,
        text: body,
        nsfw: "false",
        spoiler: "false",
      });
    }

    const result = await redditApiFetch(
      `${REDDIT_OAUTH_API}/api/submit`,
      submitResponseSchema,
      accessToken,
      { method: "POST", body: formBody.toString() }
    );

    const errors = result.json.errors;
    if (errors && errors.length > 0) {
      throw new Error(`Reddit submit error: ${JSON.stringify(errors)}`);
    }

    const postId = result.json.data.name ?? result.json.data.id ?? "";
    const postUrl =
      result.json.data.url ??
      `https://www.reddit.com/r/${subreddit}/comments/${result.json.data.id}/`;

    return {
      platformPostId: postId,
      publishedAt: new Date(),
      publishedUrl: postUrl,
    };
  }

  async getStatus(platformPostId: string, token: string): Promise<PostStatus> {
    try {
      const redditToken = parseRedditToken(token);

      // platformPostId may be "t3_XXXX" format (fullname) or just the ID
      const fullname = platformPostId.startsWith("t3_")
        ? platformPostId
        : `t3_${platformPostId}`;

      const response = await redditApiFetch(
        `${REDDIT_OAUTH_API}/api/info?id=${fullname}`,
        postLookupResponseSchema,
        redditToken.accessToken
      );

      const post = response.data.children[0]?.data;
      if (!post) {
        return { status: "FAILED", error: "Post not found" };
      }

      if (post.removed_by_category) {
        return {
          status: "FAILED",
          error: `Post removed: ${post.removed_by_category}`,
        };
      }

      return { status: "PUBLISHED" };
    } catch (err) {
      return {
        status: "FAILED",
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  async deletePost(platformPostId: string, token: string): Promise<void> {
    const redditToken = parseRedditToken(token);
    const fullname = platformPostId.startsWith("t3_")
      ? platformPostId
      : `t3_${platformPostId}`;

    const formBody = new URLSearchParams({ id: fullname });
    const response = await fetch(`${REDDIT_OAUTH_API}/api/del`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${redditToken.accessToken}`,
        "User-Agent": "PostFlow/1.0",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody.toString(),
    });

    // 404 = already deleted
    if (!response.ok && response.status !== 404) {
      throw new Error(
        `Reddit delete error (${response.status}): ${response.statusText}`
      );
    }
  }

  async getInsights(
    platformPostId: string,
    token: string
  ): Promise<Insights> {
    try {
      const redditToken = parseRedditToken(token);
      const fullname = platformPostId.startsWith("t3_")
        ? platformPostId
        : `t3_${platformPostId}`;

      const response = await redditApiFetch(
        `${REDDIT_OAUTH_API}/api/info?id=${fullname}`,
        postLookupResponseSchema,
        redditToken.accessToken
      );

      const post = response.data.children[0]?.data;
      if (!post) return {};

      return {
        impressions: post.view_count ?? undefined,
        likes: post.ups,
        comments: post.num_comments,
      };
    } catch {
      return {};
    }
  }
}

export const redditAdapter = new RedditAdapter();
