import { MediaType } from "@prisma/client";

/**
 * Minimal post data passed to platform adapters.
 * Media URLs must already be publicly accessible (e.g. uploaded to R2).
 */
export interface PostContent {
  content: string;
  mediaType: MediaType;
  /** Publicly accessible URLs for each media item */
  mediaUrls: string[];
  /** If set, the post will be scheduled for this time */
  scheduledAt?: Date | null;
}

export interface PublishResult {
  /** ID of the post on the platform (e.g. FB post ID, IG media ID) */
  platformPostId: string;
  /** Direct URL to the published post, if available */
  publishedUrl?: string;
  publishedAt: Date;
}

export interface PostStatus {
  status: "PENDING" | "PROCESSING" | "PUBLISHED" | "FAILED";
  error?: string;
}

export interface Insights {
  impressions?: number;
  reach?: number;
  likes?: number;
  comments?: number;
  shares?: number;
}

/**
 * Unified interface that every platform adapter must implement.
 * The `token` parameter is always the decrypted platform access token.
 * The `accountId` parameter is the platform-specific account/page/user ID.
 */
export interface PlatformAdapter {
  /**
   * Publish or schedule a post.
   * If post.scheduledAt is set (and in the future), the platform should
   * schedule it rather than publish immediately.
   */
  publish(
    post: PostContent,
    accountId: string,
    token: string
  ): Promise<PublishResult>;

  /**
   * Check the current publish status of a container/post by its platform ID.
   * Used for polling async containers (IG, Threads).
   */
  getStatus(platformPostId: string, token: string): Promise<PostStatus>;

  /**
   * Delete a published post by its platform ID.
   */
  deletePost(platformPostId: string, token: string): Promise<void>;

  /**
   * Fetch engagement insights for a published post.
   */
  getInsights(platformPostId: string, token: string): Promise<Insights>;
}
