import { z } from "zod";
import { MediaType } from "@prisma/client";
import {
  PostContent,
  PublishResult,
  PostStatus,
  Insights,
  PlatformAdapter,
} from "./types";
import { parsePixelfedToken } from "@/lib/auth/pixelfed-oauth";

const PIXELFED_CHAR_LIMIT = 500;

// ── Zod schemas ───────────────────────────────────────────────────────────────

const statusSchema = z.object({
  id: z.string(),
  url: z.string().optional(),
  uri: z.string(),
});

const mediaAttachmentSchema = z.object({
  id: z.string(),
  type: z.string(),
  url: z.string().optional(),
});

// ── Internal helpers ──────────────────────────────────────────────────────────

interface PixelfedErrorBody {
  error?: string;
  error_description?: string;
}

async function pixelfedFetch<T>(
  instanceUrl: string,
  path: string,
  schema: z.ZodType<T>,
  accessToken: string,
  options?: RequestInit
): Promise<T> {
  const url = `${instanceUrl}/api/v1/${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options?.headers ?? {}),
    },
  });

  const data: unknown = await response.json();

  if (!response.ok) {
    const err = data as PixelfedErrorBody;
    throw new Error(
      `Pixelfed API error (${response.status}): ${err.error_description ?? err.error ?? response.statusText}`
    );
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Pixelfed API response validation failed: ${parsed.error.message}`
    );
  }

  return parsed.data;
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class PixelfedAdapter implements PlatformAdapter {
  async publish(
    post: PostContent,
    _accountId: string,
    token: string
  ): Promise<PublishResult> {
    const { instanceUrl, accessToken } = parsePixelfedToken(token);

    if (
      post.mediaType === MediaType.VIDEO ||
      post.mediaType === MediaType.CAROUSEL
    ) {
      throw new Error(
        `Pixelfed adapter does not support ${post.mediaType} posts`
      );
    }

    const text = post.content.slice(0, PIXELFED_CHAR_LIMIT);
    const mediaIds: string[] = [];

    if (post.mediaType === MediaType.IMAGE && post.mediaUrls.length > 0) {
      for (const mediaUrl of post.mediaUrls.slice(0, 4)) {
        const id = await this.uploadMedia(instanceUrl, accessToken, mediaUrl);
        mediaIds.push(id);
      }
    }

    const formData = new FormData();
    formData.append("status", text);
    if (mediaIds.length > 0) {
      for (const id of mediaIds) {
        formData.append("media_ids[]", id);
      }
    }

    const result = await pixelfedFetch(
      instanceUrl,
      "statuses",
      statusSchema,
      accessToken,
      {
        method: "POST",
        body: formData,
        headers: {},
      }
    );

    return {
      platformPostId: result.id,
      publishedUrl: result.url ?? result.uri,
      publishedAt: new Date(),
    };
  }

  async getStatus(
    platformPostId: string,
    token: string
  ): Promise<PostStatus> {
    const { instanceUrl, accessToken } = parsePixelfedToken(token);

    try {
      await pixelfedFetch(
        instanceUrl,
        `statuses/${encodeURIComponent(platformPostId)}`,
        statusSchema,
        accessToken
      );
      return { status: "PUBLISHED" };
    } catch {
      return { status: "FAILED", error: "Post not found" };
    }
  }

  async deletePost(platformPostId: string, token: string): Promise<void> {
    const { instanceUrl, accessToken } = parsePixelfedToken(token);

    const response = await fetch(
      `${instanceUrl}/api/v1/statuses/${encodeURIComponent(platformPostId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      throw new Error(
        `Pixelfed delete failed (${response.status}): ${response.statusText}`
      );
    }
  }

  async getInsights(
    _platformPostId: string,
    _token: string
  ): Promise<Insights> {
    // Pixelfed does not expose engagement analytics via its public API
    return {};
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async uploadMedia(
    instanceUrl: string,
    accessToken: string,
    mediaUrl: string
  ): Promise<string> {
    const imageResponse = await fetch(mediaUrl);
    if (!imageResponse.ok) {
      throw new Error(
        `Failed to fetch media from URL: ${imageResponse.statusText}`
      );
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const mimeType =
      imageResponse.headers.get("content-type") ?? "image/jpeg";
    const filename = mediaUrl.split("/").pop() ?? "image.jpg";

    const formData = new FormData();
    formData.append(
      "file",
      new Blob([imageBuffer], { type: mimeType }),
      filename
    );

    // Pixelfed uses /api/v1/media (not /api/v2/media like Mastodon)
    const uploadResponse = await fetch(`${instanceUrl}/api/v1/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData,
    });

    if (!uploadResponse.ok) {
      let msg = uploadResponse.statusText;
      try {
        const body = (await uploadResponse.json()) as PixelfedErrorBody;
        msg = body.error_description ?? body.error ?? msg;
      } catch {
        // ignore
      }
      throw new Error(
        `Pixelfed media upload error (${uploadResponse.status}): ${msg}`
      );
    }

    const uploadData: unknown = await uploadResponse.json();
    const parsed = mediaAttachmentSchema.safeParse(uploadData);
    if (!parsed.success) {
      throw new Error("Pixelfed media upload response validation failed");
    }

    return parsed.data.id;
  }
}

export const pixelfedAdapter = new PixelfedAdapter();
