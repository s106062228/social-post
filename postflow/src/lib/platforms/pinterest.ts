import { z } from "zod";
import { MediaType } from "@prisma/client";
import {
  PostContent,
  PublishResult,
  PostStatus,
  Insights,
  PlatformAdapter,
} from "./types";

const PINTEREST_API_BASE = "https://api.pinterest.com/v5";

// ── Zod schemas ───────────────────────────────────────────────────────────────

const createPinResponseSchema = z.object({
  id: z.string(),
  link: z.string().optional(),
});

const pinStatusSchema = z.object({
  id: z.string(),
  status: z.string().optional(),
});

const pinAnalyticsSchema = z.object({
  all: z
    .object({
      daily_metrics: z
        .array(
          z.object({
            data_status: z.string().optional(),
            date: z.string().optional(),
            metrics: z
              .object({
                IMPRESSION: z.number().optional(),
                OUTBOUND_CLICK: z.number().optional(),
                PIN_CLICK: z.number().optional(),
                SAVE: z.number().optional(),
              })
              .optional(),
          })
        )
        .optional(),
      summary_metrics: z
        .object({
          IMPRESSION: z.number().optional(),
          OUTBOUND_CLICK: z.number().optional(),
          PIN_CLICK: z.number().optional(),
          SAVE: z.number().optional(),
        })
        .optional(),
    })
    .optional(),
});

// ── Internal helpers ──────────────────────────────────────────────────────────

interface PinterestErrorBody {
  message?: string;
  code?: number;
  error?: string;
  error_description?: string;
}

async function pinterestFetch<T>(
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

  const data: unknown = await response.json();

  if (!response.ok) {
    const err = data as PinterestErrorBody;
    throw new Error(
      `Pinterest API error (${response.status}): ${err.message ?? err.error_description ?? err.error ?? response.statusText}`
    );
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Pinterest API response validation failed: ${parsed.error.message}`
    );
  }

  return parsed.data;
}

// ── Pinterest Adapter ─────────────────────────────────────────────────────────

export class PinterestAdapter implements PlatformAdapter {
  /**
   * Publish a pin to Pinterest.
   * The `boardId` parameter (platformAccountId from SocialAccount) is the board
   * where the pin will be created.
   *
   * Supports IMAGE posts only. NONE, VIDEO, and CAROUSEL throw unsupported errors.
   */
  async publish(
    post: PostContent,
    boardId: string,
    token: string
  ): Promise<PublishResult> {
    switch (post.mediaType) {
      case MediaType.IMAGE:
        return this.publishImagePin(boardId, token, post);

      case MediaType.NONE:
        throw new Error(
          "Pinterest requires image content — text-only pins are not supported"
        );

      case MediaType.VIDEO:
        throw new Error(
          "Pinterest adapter does not yet support VIDEO posts"
        );

      case MediaType.CAROUSEL:
        throw new Error(
          "Pinterest adapter does not yet support CAROUSEL posts"
        );

      default:
        throw new Error(`Unsupported media type: ${post.mediaType}`);
    }
  }

  async getStatus(pinId: string, token: string): Promise<PostStatus> {
    const url = `${PINTEREST_API_BASE}/pins/${encodeURIComponent(pinId)}`;

    try {
      const data = await pinterestFetch(url, pinStatusSchema, token);
      const status = data.status?.toUpperCase();
      if (status === "DRAFT") return { status: "PROCESSING" };
      return { status: "PUBLISHED" };
    } catch (err) {
      return {
        status: "FAILED",
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  async deletePost(pinId: string, token: string): Promise<void> {
    const url = `${PINTEREST_API_BASE}/pins/${encodeURIComponent(pinId)}`;

    const response = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      let message = response.statusText;
      try {
        const body = (await response.json()) as PinterestErrorBody;
        message = body.message ?? body.error ?? message;
      } catch {
        // ignore parse error
      }
      throw new Error(
        `Pinterest delete error (${response.status}): ${message}`
      );
    }
  }

  async getInsights(pinId: string, token: string): Promise<Insights> {
    const endDate = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      metric_types: "IMPRESSION,OUTBOUND_CLICK,PIN_CLICK,SAVE",
    });

    const url = `${PINTEREST_API_BASE}/pins/${encodeURIComponent(pinId)}/analytics?${params.toString()}`;

    try {
      const data = await pinterestFetch(url, pinAnalyticsSchema, token);
      const summary = data.all?.summary_metrics;
      if (!summary) return {};

      return {
        impressions: summary.IMPRESSION,
        likes: summary.PIN_CLICK,
        shares: summary.SAVE,
        reach: summary.OUTBOUND_CLICK,
      };
    } catch {
      return {};
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async publishImagePin(
    boardId: string,
    token: string,
    post: PostContent
  ): Promise<PublishResult> {
    if (post.mediaUrls.length === 0) {
      throw new Error("IMAGE post requires at least one media URL");
    }

    const url = `${PINTEREST_API_BASE}/pins`;
    const body = {
      board_id: boardId,
      title: post.content.slice(0, 100),
      description: post.content,
      media_source: {
        source_type: "image_url",
        url: post.mediaUrls[0],
      },
    };

    const data = await pinterestFetch(url, createPinResponseSchema, token, {
      method: "POST",
      body: JSON.stringify(body),
    });

    return {
      platformPostId: data.id,
      publishedUrl:
        data.link ?? `https://www.pinterest.com/pin/${data.id}/`,
      publishedAt: new Date(),
    };
  }
}

export const pinterestAdapter = new PinterestAdapter();
