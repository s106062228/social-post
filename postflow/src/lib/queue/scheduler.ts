import { Queue, QueueEvents } from "bullmq";
import { PostStatus, PublishStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createRedisConnection, QUEUE_NAMES } from "./connection";
import type { PublishJobData } from "./workers/publish";
import type { TokenRefreshJobData } from "./workers/refresh";

// ── Queue singletons ───────────────────────────────────────────────────────────
// These are safe to import in Next.js API routes (server-side only).

let publishQueue: Queue<PublishJobData> | null = null;
let tokenRefreshQueue: Queue<TokenRefreshJobData> | null = null;

function getPublishQueue(): Queue<PublishJobData> {
  if (!publishQueue) {
    publishQueue = new Queue<PublishJobData>(QUEUE_NAMES.PUBLISH, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000, // 2s → 4s → 8s
        },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    });
  }
  return publishQueue;
}

function getTokenRefreshQueue(): Queue<TokenRefreshJobData> {
  if (!tokenRefreshQueue) {
    tokenRefreshQueue = new Queue<TokenRefreshJobData>(
      QUEUE_NAMES.TOKEN_REFRESH,
      {
        connection: createRedisConnection(),
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 5000, // 5s → 10s → 20s
          },
          removeOnComplete: { count: 50 },
          removeOnFail: { count: 100 },
        },
      }
    );
  }
  return tokenRefreshQueue;
}

// ── Publish scheduling ─────────────────────────────────────────────────────────

export interface SchedulePublishOptions {
  postId: string;
  /** Array of SocialAccount IDs to publish to */
  accountIds: string[];
  /** If provided, the job will be delayed until this time */
  scheduledAt?: Date | null;
}

/**
 * Schedules a post for publishing.
 *
 * For each account:
 *  1. Creates a PublishResult record (PENDING)
 *  2. Enqueues a BullMQ job (immediate or delayed)
 *
 * Returns an array of enqueued job IDs.
 */
export async function schedulePublish(
  options: SchedulePublishOptions
): Promise<string[]> {
  const { postId, accountIds, scheduledAt } = options;

  const accounts = await prisma.socialAccount.findMany({
    where: { id: { in: accountIds }, isActive: true },
    select: { id: true, platform: true },
  });

  if (accounts.length === 0) {
    throw new Error("No active social accounts found for the given IDs");
  }

  // Transition post to SCHEDULED (or keep as PUBLISHING if immediate)
  const isScheduled = scheduledAt && scheduledAt > new Date();
  await prisma.post.update({
    where: { id: postId },
    data: { status: isScheduled ? PostStatus.SCHEDULED : PostStatus.PUBLISHING },
  });

  const queue = getPublishQueue();
  const jobIds: string[] = [];

  for (const account of accounts) {
    // Create a PublishResult row
    const publishResult = await prisma.publishResult.create({
      data: {
        postId,
        platform: account.platform,
        accountId: account.id,
        status: PublishStatus.PENDING,
      },
    });

    // Calculate delay if scheduled in the future
    const delayMs =
      isScheduled ? Math.max(0, scheduledAt.getTime() - Date.now()) : 0;

    const jobId = `publish:${postId}:${account.id}`;
    const jobData: PublishJobData = {
      postId,
      accountId: account.id,
      publishResultId: publishResult.id,
    };

    await queue.add(jobId, jobData, {
      jobId,
      delay: delayMs,
    });

    jobIds.push(jobId);
  }

  return jobIds;
}

/**
 * Cancels a scheduled publish job for a given post and account.
 * Only works if the job hasn't started yet.
 */
export async function cancelScheduledPublish(
  postId: string,
  accountId: string
): Promise<boolean> {
  const queue = getPublishQueue();
  const jobId = `publish:${postId}:${accountId}`;
  const job = await queue.getJob(jobId);

  if (!job) return false;

  const state = await job.getState();
  if (state === "delayed" || state === "waiting") {
    await job.remove();
    return true;
  }

  return false;
}

// ── Token refresh scheduling ───────────────────────────────────────────────────

/**
 * Enqueues a token refresh job for a social account.
 * Designed to be called proactively (e.g. 7 days before expiry).
 *
 * @param socialAccountId - The SocialAccount.id to refresh
 * @param runAt - When to run the refresh (defaults to now)
 */
export async function scheduleTokenRefresh(
  socialAccountId: string,
  runAt?: Date
): Promise<void> {
  const queue = getTokenRefreshQueue();
  const jobId = `token-refresh:${socialAccountId}`;

  const delayMs = runAt ? Math.max(0, runAt.getTime() - Date.now()) : 0;

  const jobData: TokenRefreshJobData = { socialAccountId };

  await queue.add(jobId, jobData, {
    jobId,
    delay: delayMs,
  });
}

/**
 * Schedules token refresh jobs for all active accounts that expire within
 * `lookAheadDays` days. Safe to call on a recurring cron schedule.
 */
export async function scheduleExpiringTokenRefreshes(
  lookAheadDays = 7
): Promise<number> {
  const cutoff = new Date(
    Date.now() + lookAheadDays * 24 * 60 * 60 * 1000
  );

  const expiringAccounts = await prisma.socialAccount.findMany({
    where: {
      isActive: true,
      tokenExpiresAt: { lte: cutoff, not: null },
    },
    select: { id: true, tokenExpiresAt: true },
  });

  for (const account of expiringAccounts) {
    // Refresh 1 day before expiry so there's still a valid token if it fails
    const refreshAt = account.tokenExpiresAt
      ? new Date(account.tokenExpiresAt.getTime() - 24 * 60 * 60 * 1000)
      : new Date();

    await scheduleTokenRefresh(account.id, refreshAt);
  }

  return expiringAccounts.length;
}

// ── Queue event helpers ────────────────────────────────────────────────────────

/**
 * Creates a QueueEvents instance for listening to publish queue events.
 * Useful for waiting on job completion in tests or API handlers.
 */
export function createPublishQueueEvents(): QueueEvents {
  return new QueueEvents(QUEUE_NAMES.PUBLISH, {
    connection: createRedisConnection(),
  });
}

// ── Platform-specific routing note ────────────────────────────────────────────
// Facebook supports native scheduled_publish_time, but we still route all
// platforms through BullMQ for consistent retry, observability, and status
// tracking. The Facebook adapter will pass scheduledAt to the Graph API.
