import { Worker, Job } from "bullmq";
import { Platform, PostStatus, PublishStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getTokenWithRefresh } from "@/lib/auth/token-manager";
import { facebookAdapter } from "@/lib/platforms/facebook";
import { instagramAdapter } from "@/lib/platforms/instagram";
import { threadsAdapter } from "@/lib/platforms/threads";
import { linkedInAdapter } from "@/lib/platforms/linkedin";
import { pinterestAdapter } from "@/lib/platforms/pinterest";
import { youTubeAdapter } from "@/lib/platforms/youtube";
import { tikTokAdapter } from "@/lib/platforms/tiktok";
import { twitterAdapter } from "@/lib/platforms/twitter";
import { blueskyAdapter } from "@/lib/platforms/bluesky";
import { mastodonAdapter } from "@/lib/platforms/mastodon";
import { telegramAdapter } from "@/lib/platforms/telegram";
import { redditAdapter } from "@/lib/platforms/reddit";
import { nostrAdapter } from "@/lib/platforms/nostr";
import { tumblrAdapter } from "@/lib/platforms/tumblr";
import type { PlatformAdapter } from "@/lib/platforms/types";
import { createRedisConnection, QUEUE_NAMES } from "../connection";
import { publishLogger } from "@/lib/logger";
import { notifyPostOutcome } from "@/lib/email";
import { notifyPostOutcomeInApp } from "@/lib/notifications";
import { dispatchWebhooks, type WebhookEvent } from "@/lib/webhook-dispatch";
import { dispatchSlackNotifications, type IntegrationEvent } from "@/lib/slack-notify";
import { dispatchDiscordNotifications } from "@/lib/discord-notify";

// ── Job payload types ──────────────────────────────────────────────────────────

export interface PublishJobData {
  postId: string;
  accountId: string;
  publishResultId: string;
}

// ── Adapter map ────────────────────────────────────────────────────────────────

const adapters: Record<Platform, PlatformAdapter> = {
  [Platform.FACEBOOK]: facebookAdapter,
  [Platform.INSTAGRAM]: instagramAdapter,
  [Platform.THREADS]: threadsAdapter,
  [Platform.LINKEDIN]: linkedInAdapter,
  [Platform.PINTEREST]: pinterestAdapter,
  [Platform.YOUTUBE]: youTubeAdapter,
  [Platform.TIKTOK]: tikTokAdapter,
  [Platform.TWITTER]: twitterAdapter,
  [Platform.BLUESKY]: blueskyAdapter,
  [Platform.MASTODON]: mastodonAdapter,
  [Platform.TELEGRAM]: telegramAdapter,
  [Platform.REDDIT]: redditAdapter,
  [Platform.NOSTR]: nostrAdapter,
  [Platform.TUMBLR]: tumblrAdapter,
};

// ── Exponential backoff helper ─────────────────────────────────────────────────

/**
 * Returns the delay in milliseconds for a given retry attempt (1-indexed).
 * Uses exponential backoff: 2s, 4s, 8s (capped at 3 retries).
 */
function backoffDelay(attemptNumber: number): number {
  return Math.pow(2, attemptNumber) * 1000;
}

// ── Worker processor ───────────────────────────────────────────────────────────

async function processPublishJob(job: Job<PublishJobData>): Promise<void> {
  const { postId, accountId, publishResultId } = job.data;

  // Fetch the post
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) {
    throw new Error(`Post not found: ${postId}`);
  }

  // Fetch the social account
  const account = await prisma.socialAccount.findUnique({
    where: { id: accountId },
  });
  if (!account || !account.isActive) {
    throw new Error(`Social account not found or inactive: ${accountId}`);
  }

  // Mark as PROCESSING
  await prisma.publishResult.update({
    where: { id: publishResultId },
    data: { status: PublishStatus.PROCESSING },
  });

  // Get decrypted token (auto-refresh if near expiry)
  const token = await getTokenWithRefresh({
    id: account.id,
    encryptedToken: account.encryptedToken,
    tokenExpiresAt: account.tokenExpiresAt,
    platform: account.platform,
  });

  const adapter = adapters[account.platform];

  // Use platform-specific variant if one exists, otherwise fall back to post content
  const variant = await prisma.postVariant.findUnique({
    where: { postId_platform: { postId, platform: account.platform } },
  });

  const postContent = {
    content: variant?.content ?? post.content,
    mediaType: variant?.mediaType ?? post.mediaType,
    mediaUrls: variant?.mediaUrls ?? post.mediaUrls,
    scheduledAt: post.scheduledAt,
  };

  const result = await adapter.publish(
    postContent,
    account.platformAccountId,
    token
  );

  // Mark as PUBLISHED
  await prisma.publishResult.update({
    where: { id: publishResultId },
    data: {
      status: PublishStatus.PUBLISHED,
      platformPostId: result.platformPostId,
      publishedUrl: result.publishedUrl ?? null,
      publishedAt: result.publishedAt,
    },
  });

  // Post first comment if set and adapter supports it
  if (post.firstComment && adapter.addComment) {
    try {
      await adapter.addComment(result.platformPostId, post.firstComment, token);
    } catch (err) {
      publishLogger.warn(
        { err, postId, platform: account.platform },
        "First comment failed — post was published successfully"
      );
    }
  }

  // Check if all results for this post are done to update overall post status
  await reconcilePostStatus(postId);
}

/**
 * After each publish result is finalized, reconcile the overall Post status.
 * If all results are done (PUBLISHED or FAILED), update the Post accordingly.
 */
async function reconcilePostStatus(postId: string): Promise<void> {
  const results = await prisma.publishResult.findMany({
    where: { postId },
    select: { status: true },
  });

  const allDone = results.every(
    (r: { status: PublishStatus }) =>
      r.status === PublishStatus.PUBLISHED || r.status === PublishStatus.FAILED
  );

  if (!allDone) return;

  const anyPublished = results.some(
    (r: { status: PublishStatus }) => r.status === PublishStatus.PUBLISHED
  );
  const anyFailed = results.some(
    (r: { status: PublishStatus }) => r.status === PublishStatus.FAILED
  );

  let finalStatus: PostStatus;
  if (anyPublished && anyFailed) {
    finalStatus = PostStatus.PARTIALLY_PUBLISHED;
  } else if (anyPublished) {
    finalStatus = PostStatus.PUBLISHED;
  } else {
    finalStatus = PostStatus.FAILED;
  }

  const updatedPost = await prisma.post.update({
    where: { id: postId },
    data: { status: finalStatus },
    select: { id: true, userId: true },
  });

  notifyPostOutcome(postId, finalStatus);
  notifyPostOutcomeInApp(postId, updatedPost.userId, finalStatus);

  const eventMap: Partial<Record<PostStatus, WebhookEvent & IntegrationEvent>> = {
    [PostStatus.PUBLISHED]: "post.published",
    [PostStatus.FAILED]: "post.failed",
    [PostStatus.PARTIALLY_PUBLISHED]: "post.partially_published",
  };
  const webhookEvent = eventMap[finalStatus];
  if (webhookEvent) {
    dispatchWebhooks(updatedPost.userId, webhookEvent, { postId });
    dispatchSlackNotifications(updatedPost.userId, webhookEvent, postId);
    dispatchDiscordNotifications(updatedPost.userId, webhookEvent, postId);
  }
}

// ── Worker factory ─────────────────────────────────────────────────────────────

/**
 * Creates and returns a BullMQ Worker for the publish queue.
 * Call this in the standalone worker process (workers/queue-worker.ts).
 */
export function createPublishWorker(): Worker<PublishJobData> {
  const connection = createRedisConnection();

  const worker = new Worker<PublishJobData>(
    QUEUE_NAMES.PUBLISH,
    processPublishJob,
    {
      connection,
      concurrency: 5,
      // BullMQ built-in retry with exponential backoff
      // The actual retries are set when enqueuing the job (in scheduler.ts)
    }
  );

  worker.on("failed", async (job: Job<PublishJobData> | undefined, error: Error) => {
    if (!job) return;

    const { publishResultId, postId } = job.data;
    const attemptsMade = job.attemptsMade ?? 0;
    const maxAttempts = job.opts.attempts ?? 1;

    // Update retry count
    await prisma.publishResult.update({
      where: { id: publishResultId },
      data: { retryCount: attemptsMade },
    });

    // Only mark as FAILED after all retries are exhausted
    if (attemptsMade >= maxAttempts) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      await prisma.publishResult.update({
        where: { id: publishResultId },
        data: {
          status: PublishStatus.FAILED,
          error: errorMessage,
          retryCount: attemptsMade,
        },
      });

      await reconcilePostStatus(postId);
    }
  });

  worker.on("error", (error: Error) => {
    publishLogger.error({ err: error }, "PublishWorker error");
  });

  return worker;
}

/**
 * BullMQ backoff strategy function.
 * Referenced by job options in scheduler.ts.
 */
export { backoffDelay };
