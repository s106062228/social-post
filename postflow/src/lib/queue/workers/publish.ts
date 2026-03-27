import { Worker, Job } from "bullmq";
import { Platform, PostStatus, PublishStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getTokenWithRefresh } from "@/lib/auth/token-manager";
import { facebookAdapter } from "@/lib/platforms/facebook";
import { instagramAdapter } from "@/lib/platforms/instagram";
import { threadsAdapter } from "@/lib/platforms/threads";
import type { PlatformAdapter } from "@/lib/platforms/types";
import { createRedisConnection, QUEUE_NAMES } from "../connection";

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
  });

  const adapter = adapters[account.platform];
  const postContent = {
    content: post.content,
    mediaType: post.mediaType,
    mediaUrls: post.mediaUrls,
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

  await prisma.post.update({
    where: { id: postId },
    data: { status: finalStatus },
  });
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
    // Log worker-level errors (connection issues, etc.)
    console.error("[PublishWorker] Worker error:", error.message);
  });

  return worker;
}

/**
 * BullMQ backoff strategy function.
 * Referenced by job options in scheduler.ts.
 */
export { backoffDelay };
