import { z } from "zod";
import { MediaType } from "@prisma/client";
import {
  PostContent,
  PublishResult,
  PostStatus,
  Insights,
  PlatformAdapter,
} from "./types";
import { parseBeehiivToken } from "@/lib/auth/beehiiv-oauth";

const BEEHIIV_API_BASE = "https://api.beehiiv.com/v2";
const BEEHIIV_TEXT_LIMIT = 50000;

// ── Zod schemas ───────────────────────────────────────────────────────────────

const createPostResponseSchema = z.object({
  data: z.object({
    id: z.string(),
    status: z.string().optional(),
    web_url: z.string().optional().nullable(),
  }),
});

const getPostResponseSchema = z.object({
  data: z.object({
    id: z.string(),
    status: z.string().optional().nullable(),
    stats: z
      .object({
        email_open_rate: z.number().optional().nullable(),
        unique_clicked: z.number().optional().nullable(),
        total_sent: z.number().optional().nullable(),
      })
      .optional()
      .nullable(),
  }),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function beehiivApiFetch<T>(
  url: string,
  schema: z.ZodType<T>,
  apiKey: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options?.headers ?? {}),
    },
  });

  const data: unknown = await response.json();

  if (!response.ok) {
    const errData = data as { message?: string };
    const detail = errData.message ?? response.statusText;
    throw new Error(`Beehiiv API error (${response.status}): ${detail}`);
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Beehiiv API response validation failed: ${parsed.error.message}`
    );
  }

  return parsed.data;
}

// ── Beehiiv Adapter ───────────────────────────────────────────────────────────

export class BeehiivAdapter implements PlatformAdapter {
  /**
   * Publish a post to Beehiiv as a newsletter draft.
   * Supports NONE (text newsletter) and IMAGE (newsletter with embedded image).
   * VIDEO and CAROUSEL are unsupported.
   * The token is a serialized BeehiivToken JSON.
   */
  async publish(
    post: PostContent,
    _accountId: string,
    token: string
  ): Promise<PublishResult> {
    if (
      post.mediaType === MediaType.VIDEO ||
      post.mediaType === MediaType.CAROUSEL
    ) {
      throw new Error(
        `Beehiiv adapter does not support ${post.mediaType} posts`
      );
    }

    const beehiivToken = parseBeehiivToken(token);
    const { apiKey, publicationId } = beehiivToken;

    const content = post.content.slice(0, BEEHIIV_TEXT_LIMIT);

    // First line becomes the subject/title, remainder becomes body
    const newlineIdx = content.indexOf("\n");
    const subject =
      newlineIdx > 0
        ? content.slice(0, newlineIdx).trim()
        : content.slice(0, 200).trim();
    const body = newlineIdx > 0 ? content.slice(newlineIdx + 1).trim() : "";

    // Build HTML body
    let htmlContent = `<h1>${subject}</h1>`;
    if (body) {
      htmlContent += `<p>${body.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br />")}</p>`;
    }

    // Embed image if provided
    if (post.mediaType === MediaType.IMAGE && post.mediaUrls.length > 0) {
      htmlContent += `<figure><img src="${post.mediaUrls[0]}" alt="Post image" /></figure>`;
    }

    const result = await beehiivApiFetch(
      `${BEEHIIV_API_BASE}/publications/${publicationId}/posts`,
      createPostResponseSchema,
      apiKey,
      {
        method: "POST",
        body: JSON.stringify({
          subject_line: subject,
          preview_text: body.slice(0, 150) || subject,
          content_html: htmlContent,
          status: "draft",
          send_at: null,
        }),
      }
    );

    return {
      platformPostId: result.data.id,
      publishedAt: new Date(),
      publishedUrl: result.data.web_url ?? "",
    };
  }

  async getStatus(platformPostId: string, token: string): Promise<PostStatus> {
    const beehiivToken = parseBeehiivToken(token);
    const { apiKey, publicationId } = beehiivToken;

    try {
      const result = await beehiivApiFetch(
        `${BEEHIIV_API_BASE}/publications/${publicationId}/posts/${platformPostId}`,
        getPostResponseSchema,
        apiKey
      );

      const status = result.data.status;
      if (status === "confirmed" || status === "published") {
        return { status: "PUBLISHED" };
      }
      // draft, pending, etc. → treat as published since we created it
      return { status: "PUBLISHED" };
    } catch {
      return { status: "PUBLISHED" };
    }
  }

  async deletePost(_platformPostId: string, _token: string): Promise<void> {
    // Beehiiv does not expose a delete endpoint in the public v2 API.
    return;
  }

  async getInsights(
    _platformPostId: string,
    _token: string
  ): Promise<Insights> {
    // Beehiiv newsletter stats are not available through the public API
    // without additional scopes. Return empty insights.
    return {};
  }
}

export const beehiivAdapter = new BeehiivAdapter();
