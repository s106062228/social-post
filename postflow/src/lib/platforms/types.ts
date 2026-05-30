import { MediaType } from "@prisma/client";

/** A single item in a thread or carousel sequence */
export interface ThreadItem {
  content: string;
  mediaUrls: string[];
  mediaType: MediaType;
}

/**
 * Minimal post data passed to platform adapters.
 * Media URLs must already be publicly accessible (e.g. uploaded to R2).
 */
export interface PostContent {
  content: string;
  mediaType: MediaType;
  /** Publicly accessible URLs for each media item */
  mediaUrls: string[];
  /** Alt text for each media item (index-aligned with mediaUrls) */
  altTexts?: string[];
  /** If set, the post will be scheduled for this time */
  scheduledAt?: Date | null;
  /**
   * Optional follow-up thread items. Supported by Twitter (reply chain)
   * and Instagram (carousel via separate container).
   * When present, the main post content becomes item 0.
   */
  threadItems?: ThreadItem[];
  /**
   * Optional poll to attach to the post.
   * Supported by Twitter and LinkedIn.
   */
  poll?: {
    question: string;
    options: string[];
    durationHours: number;
  };
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

/** A comment fetched from a platform (for the inbox) */
export interface IncomingComment {
  platformCommentId: string;
  authorName: string;
  authorHandle: string;
  authorAvatarUrl?: string;
  content: string;
  postedAt: Date;
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

  /**
   * Post a comment on a published post/media.
   * Optional — only FB and IG support this; Threads does not.
   */
  addComment?(platformPostId: string, comment: string, token: string): Promise<void>;

  /**
   * Fetch recent comments on a published post.
   * Optional — implemented for Facebook and Instagram.
   */
  fetchComments?(platformPostId: string, token: string): Promise<IncomingComment[]>;
}
