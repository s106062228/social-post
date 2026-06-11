import { Queue, QueueEvents } from "bullmq";
import { PostStatus, PublishStatus } from "@prisma/client";
import { CronExpressionParser } from "cron-parser";
import { prisma } from "@/lib/db";
import { createRedisConnection, QUEUE_NAMES } from "./connection";
import type { PublishJobData } from "./workers/publish";
import type { TokenRefreshJobData } from "./workers/refresh";
import type { TokenExpiryCheckJobData } from "./workers/token-expiry";
import type { RecurringScheduleJobData } from "./workers/recurring-schedule";
import type { SyncInsightsScanJobData } from "./workers/sync-insights";
import type { RssImportScanJobData } from "./workers/rss-import";
import type { ReportScanJobData } from "./workers/report";
import type { ReminderJobData } from "./workers/reminder";
import type { PerformanceAlertScanJobData } from "./workers/performance-alert";
import type { PostExpiryJobData } from "./workers/expiry";
import type { DigestScanJobData } from "./workers/digest";
import type { AudienceSyncJobData } from "./workers/audience-sync";
import type { EvergreenRecycleJobData } from "./workers/evergreen-recycle";
import type { CoachingScanJobData } from "./workers/coaching";
import type { EngagementGoalScanJobData } from "./workers/engagement-goals";
import type { TokenHealthScanJobData } from "./workers/token-health";
import type { ContentDigestJobData } from "./workers/content-digest";
import type { DailyBriefingJobData } from "./workers/daily-briefing";

// ── Queue singletons ────────────────────────────────────────────────────────────────
// These are safe to import in Next.js API routes (server-side only).

let publishQueue: Queue<PublishJobData> | null = null;
let tokenRefreshQueue: Queue<TokenRefreshJobData> | null = null;
let tokenExpiryCheckQueue: Queue<TokenExpiryCheckJobData> | null = null;

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

function getTokenExpiryCheckQueue(): Queue<TokenExpiryCheckJobData> {
  if (!tokenExpiryCheckQueue) {
    tokenExpiryCheckQueue = new Queue<TokenExpiryCheckJobData>(
      QUEUE_NAMES.TOKEN_EXPIRY_CHECK,
      {
        connection: createRedisConnection(),
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: { count: 30 },
          removeOnFail: { count: 50 },
        },
      }
    );
  }
  return tokenExpiryCheckQueue;
}

// ── Publish scheduling ─────────────────────────────────────────────────────────────────

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

// ── Token refresh scheduling ───────────────────────────────────────────────────────────

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

// ── Token expiry cron ─────────────────────────────────────────────────────────────

/**
 * Registers (or upserts) the daily BullMQ repeatable job that checks for
 * expired / expiring tokens. Safe to call on every worker startup — BullMQ
 * deduplicates repeatable jobs by their key.
 *
 * Schedule: 02:00 UTC every day.
 */
export async function scheduleTokenExpiryCheck(): Promise<void> {
  const queue = getTokenExpiryCheckQueue();

  await queue.add(
    "token-expiry-check",
    { triggeredAt: new Date().toISOString() },
    {
      repeat: { pattern: "0 2 * * *" },
      jobId: "token-expiry-check:daily",
    }
  );
}

// ── Recurring schedule queue ───────────────────────────────────────────────────────────

let recurringScheduleQueue: Queue<RecurringScheduleJobData> | null = null;

function getRecurringScheduleQueue(): Queue<RecurringScheduleJobData> {
  if (!recurringScheduleQueue) {
    recurringScheduleQueue = new Queue<RecurringScheduleJobData>(
      QUEUE_NAMES.RECURRING_SCHEDULE,
      {
        connection: createRedisConnection(),
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: { count: 50 },
          removeOnFail: { count: 100 },
        },
      }
    );
  }
  return recurringScheduleQueue;
}

/**
 * Registers the BullMQ repeatable job that checks for due recurring schedules
 * every minute. Safe to call on every worker startup — BullMQ deduplicates
 * repeatable jobs by their key.
 */
export async function scheduleRecurringCheck(): Promise<void> {
  const queue = getRecurringScheduleQueue();

  await queue.add(
    "recurring-schedule-check",
    { triggeredAt: new Date().toISOString() },
    {
      repeat: { pattern: "* * * * *" },
      jobId: "recurring-schedule-check:minutely",
    }
  );
}

/**
 * Calculates the first nextRunAt for a new recurring schedule.
 * Returns null if the cron expression is invalid.
 */
export function calcNextRunAt(cronExpr: string, timezone: string): Date | null {
  try {
    const interval = CronExpressionParser.parse(cronExpr, { tz: timezone });
    return interval.next().toDate();
  } catch {
    return null;
  }
}

/**
 * Validates a cron expression. Returns true if valid.
 */
export function isValidCronExpr(cronExpr: string): boolean {
  try {
    CronExpressionParser.parse(cronExpr);
    return true;
  } catch {
    return false;
  }
}

// ── Insights sync queue ──────────────────────────────────────────────────────────────

let syncInsightsScanQueue: Queue<SyncInsightsScanJobData> | null = null;

function getSyncInsightsScanQueue(): Queue<SyncInsightsScanJobData> {
  if (!syncInsightsScanQueue) {
    syncInsightsScanQueue = new Queue<SyncInsightsScanJobData>(
      QUEUE_NAMES.SYNC_INSIGHTS_SCAN,
      {
        connection: createRedisConnection(),
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: { count: 30 },
          removeOnFail: { count: 50 },
        },
      }
    );
  }
  return syncInsightsScanQueue;
}

/**
 * Registers the daily BullMQ repeatable job that scans for published posts and
 * syncs their engagement insights. Runs at 03:00 UTC every day.
 * Safe to call on every worker startup — BullMQ deduplicates by job key.
 */
export async function scheduleSyncInsightsScan(): Promise<void> {
  const queue = getSyncInsightsScanQueue();

  await queue.add(
    "sync-insights-scan",
    { triggeredAt: new Date().toISOString() },
    {
      repeat: { pattern: "0 3 * * *" },
      jobId: "sync-insights-scan:daily",
    }
  );
}

// ── RSS import queue ──────────────────────────────────────────────────────────────

let rssImportQueue: Queue<RssImportScanJobData> | null = null;

function getRssImportQueue(): Queue<RssImportScanJobData> {
  if (!rssImportQueue) {
    rssImportQueue = new Queue<RssImportScanJobData>(QUEUE_NAMES.RSS_IMPORT, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { count: 30 },
        removeOnFail: { count: 50 },
      },
    });
  }
  return rssImportQueue;
}

/**
 * Registers the BullMQ repeatable job that fetches all RSS feeds hourly.
 * Safe to call on every worker startup — BullMQ deduplicates by job key.
 * Schedule: every hour at minute 0.
 */
export async function scheduleRssImport(): Promise<void> {
  const queue = getRssImportQueue();

  await queue.add(
    "rss-import-scan",
    { triggeredAt: new Date().toISOString() },
    {
      repeat: { pattern: "0 * * * *" },
      jobId: "rss-import-scan:hourly",
    }
  );
}

/**
 * Enqueues an immediate RSS import job for all feeds (used by manual fetch API).
 */
export async function triggerRssImport(): Promise<void> {
  const queue = getRssImportQueue();
  await queue.add(
    "rss-import-manual",
    { triggeredAt: new Date().toISOString() },
    { jobId: `rss-import-manual:${Date.now()}` }
  );
}

// ── Report schedule queue ───────────────────────────────────────────────────────────

let reportQueue: Queue<ReportScanJobData> | null = null;

function getReportQueue(): Queue<ReportScanJobData> {
  if (!reportQueue) {
    reportQueue = new Queue<ReportScanJobData>(QUEUE_NAMES.REPORT, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { count: 30 },
        removeOnFail: { count: 50 },
      },
    });
  }
  return reportQueue;
}

/**
 * Registers the daily BullMQ repeatable job that scans for due report schedules
 * and sends analytics email reports. Safe to call on every worker startup —
 * BullMQ deduplicates by job key.
 * Schedule: daily at 08:00 UTC.
 */
export async function scheduleReportScan(): Promise<void> {
  const queue = getReportQueue();

  await queue.add(
    "report-scan",
    { triggeredAt: new Date().toISOString() },
    {
      repeat: { pattern: "0 8 * * *" },
      jobId: "report-scan:daily",
    }
  );
}

// ── Performance alert scan queue ───────────────────────────────────────────────────────

let performanceAlertScanQueue: Queue<PerformanceAlertScanJobData> | null = null;

function getPerformanceAlertScanQueue(): Queue<PerformanceAlertScanJobData> {
  if (!performanceAlertScanQueue) {
    performanceAlertScanQueue = new Queue<PerformanceAlertScanJobData>(
      QUEUE_NAMES.PERFORMANCE_ALERT_SCAN,
      {
        connection: createRedisConnection(),
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: { count: 30 },
          removeOnFail: { count: 50 },
        },
      }
    );
  }
  return performanceAlertScanQueue;
}

/**
 * Registers the daily BullMQ repeatable job that evaluates performance alerts
 * for all users. Runs at 04:00 UTC every day.
 * Safe to call on every worker startup — BullMQ deduplicates by job key.
 */
export async function schedulePerformanceAlertScan(): Promise<void> {
  const queue = getPerformanceAlertScanQueue();

  await queue.add(
    "performance-alert-scan",
    { triggeredAt: new Date().toISOString() },
    {
      repeat: { pattern: "0 4 * * *" },
      jobId: "performance-alert-scan:daily",
    }
  );
}

// ── Audience sync queue ───────────────────────────────────────────────────────────

let audienceSyncQueue: Queue<AudienceSyncJobData> | null = null;

function getAudienceSyncQueue(): Queue<AudienceSyncJobData> {
  if (!audienceSyncQueue) {
    audienceSyncQueue = new Queue<AudienceSyncJobData>(QUEUE_NAMES.AUDIENCE_SYNC, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 20 },
      },
    });
  }
  return audienceSyncQueue;
}

/**
 * Registers (or upserts) the daily BullMQ repeatable job that syncs follower
 * counts for all active social accounts. Runs at 05:00 UTC every day.
 * Safe to call on every worker startup — BullMQ deduplicates by job key.
 */
export async function scheduleAudienceSync(): Promise<void> {
  const queue = getAudienceSyncQueue();
  await queue.add(
    "audience-sync",
    { triggeredAt: new Date().toISOString() },
    {
      repeat: { pattern: "0 5 * * *" },
      jobId: "audience-sync:daily",
    }
  );
}

// ── Queue event helpers ────────────────────────────────────────────────────────────

/**
 * Creates a QueueEvents instance for listening to publish queue events.
 * Useful for waiting on job completion in tests or API handlers.
 */
export function createPublishQueueEvents(): QueueEvents {
  return new QueueEvents(QUEUE_NAMES.PUBLISH, {
    connection: createRedisConnection(),
  });
}

// ── Platform-specific routing note ────────────────────────────────────────────────
// Facebook supports native scheduled_publish_time, but we still route all
// platforms through BullMQ for consistent retry, observability, and status
// tracking. The Facebook adapter will pass scheduledAt to the Graph API.

// ── Reminder queue ───────────────────────────────────────────────────────────────

let reminderQueue: Queue<ReminderJobData> | null = null;

function getReminderQueue(): Queue<ReminderJobData> {
  if (!reminderQueue) {
    reminderQueue = new Queue<ReminderJobData>(QUEUE_NAMES.REMINDER, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 100 },
      },
    });
  }
  return reminderQueue;
}

/**
 * Schedules (or replaces) a reminder notification for a post.
 * Fires at `scheduledAt - reminderMinutes` minutes.
 * If the fire time is in the past, the job runs immediately.
 */
export async function scheduleReminder(
  postId: string,
  userId: string,
  scheduledAt: Date,
  reminderMinutes: number
): Promise<void> {
  const fireAt = new Date(scheduledAt.getTime() - reminderMinutes * 60 * 1000);
  const delayMs = Math.max(0, fireAt.getTime() - Date.now());

  const queue = getReminderQueue();
  const jobId = `reminder:${postId}`;

  await queue.add(
    jobId,
    { postId, userId, scheduledAt: scheduledAt.toISOString() },
    { jobId, delay: delayMs }
  );
}

/**
 * Cancels a pending reminder job for a post (no-op if not found or already fired).
 */
export async function cancelReminder(postId: string): Promise<boolean> {
  const queue = getReminderQueue();
  const jobId = `reminder:${postId}`;
  const job = await queue.getJob(jobId);
  if (!job) return false;

  const state = await job.getState();
  if (state === "delayed" || state === "waiting") {
    await job.remove();
    return true;
  }
  return false;
}

// ── Post expiry queue ──────────────────────────────────────────────────────────────

let postExpiryQueue: Queue<PostExpiryJobData> | null = null;

function getPostExpiryQueue(): Queue<PostExpiryJobData> {
  if (!postExpiryQueue) {
    postExpiryQueue = new Queue<PostExpiryJobData>(QUEUE_NAMES.POST_EXPIRY, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 100 },
      },
    });
  }
  return postExpiryQueue;
}

/**
 * Schedules (or replaces) a delayed expiry job for a post.
 * Fires at `expiresAt`. If the fire time is in the past, runs immediately.
 */
export async function scheduleExpiry(
  postId: string,
  userId: string,
  expiresAt: Date
): Promise<void> {
  const delayMs = Math.max(0, expiresAt.getTime() - Date.now());
  const queue = getPostExpiryQueue();
  const jobId = `expiry:${postId}`;

  await queue.add(
    jobId,
    { postId, userId },
    { jobId, delay: delayMs }
  );
}

/**
 * Cancels a pending expiry job for a post (no-op if not found or already fired).
 */
export async function cancelExpiry(postId: string): Promise<boolean> {
  const queue = getPostExpiryQueue();
  const jobId = `expiry:${postId}`;
  const job = await queue.getJob(jobId);
  if (!job) return false;

  const state = await job.getState();
  if (state === "delayed" || state === "waiting") {
    await job.remove();
    return true;
  }
  return false;
}

// ── Notification Digest Queue ──────────────────────────────────────────────────

let digestQueue: Queue<DigestScanJobData> | null = null;

function getDigestQueue(): Queue<DigestScanJobData> {
  if (!digestQueue) {
    digestQueue = new Queue<DigestScanJobData>(QUEUE_NAMES.NOTIFICATION_DIGEST, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 20 },
      },
    });
  }
  return digestQueue;
}

/**
 * Registers (or replaces) the weekly Monday 09:00 UTC digest cron job.
 */
export async function scheduleDigest(): Promise<void> {
  const queue = getDigestQueue();
  await queue.upsertJobScheduler(
    "notification-digest-weekly",
    { pattern: "0 9 * * 1" },
    {
      name: "notification-digest-weekly",
      data: { triggeredAt: new Date().toISOString() },
      opts: {
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { count: 5 },
        removeOnFail: { count: 10 },
      },
    }
  );
}

// ── Evergreen Recycle Queue ────────────────────────────────────────────────────

let evergreenRecycleQueue: Queue<EvergreenRecycleJobData> | null = null;

function getEvergreenRecycleQueue(): Queue<EvergreenRecycleJobData> {
  if (!evergreenRecycleQueue) {
    evergreenRecycleQueue = new Queue<EvergreenRecycleJobData>(
      QUEUE_NAMES.EVERGREEN_RECYCLE,
      {
        connection: createRedisConnection(),
        defaultJobOptions: {
          attempts: 2,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: { count: 10 },
          removeOnFail: { count: 20 },
        },
      }
    );
  }
  return evergreenRecycleQueue;
}

/**
 * Registers (or replaces) the daily 03:00 UTC evergreen recycle cron job.
 */
export async function scheduleEvergreenRecycle(): Promise<void> {
  const queue = getEvergreenRecycleQueue();
  await queue.upsertJobScheduler(
    "evergreen-recycle-daily",
    { pattern: "0 3 * * *" },
    {
      name: "evergreen-recycle-daily",
      data: { triggeredAt: new Date().toISOString() },
      opts: {
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { count: 5 },
        removeOnFail: { count: 10 },
      },
    }
  );
}

// ── Coaching Scan Queue ────────────────────────────────────────────────────────

let coachingScanQueue: Queue<CoachingScanJobData> | null = null;

function getCoachingScanQueue(): Queue<CoachingScanJobData> {
  if (!coachingScanQueue) {
    coachingScanQueue = new Queue<CoachingScanJobData>(
      QUEUE_NAMES.COACHING_SCAN,
      {
        connection: createRedisConnection(),
        defaultJobOptions: {
          attempts: 2,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: { count: 5 },
          removeOnFail: { count: 10 },
        },
      }
    );
  }
  return coachingScanQueue;
}

/**
 * Registers (or replaces) the weekly Sunday 01:00 UTC coaching scan cron job.
 * Generates AI performance coaching insights for active users.
 */
export async function scheduleCoachingScan(): Promise<void> {
  const queue = getCoachingScanQueue();
  await queue.upsertJobScheduler(
    "coaching-scan-weekly",
    { pattern: "0 1 * * 0" },
    {
      name: "coaching-scan-weekly",
      data: { triggeredAt: new Date().toISOString() },
      opts: {
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { count: 5 },
        removeOnFail: { count: 10 },
      },
    }
  );
}

// ── Engagement Goal Scan Queue ─────────────────────────────────────────────────

let engagementGoalScanQueue: Queue<EngagementGoalScanJobData> | null = null;

function getEngagementGoalScanQueue(): Queue<EngagementGoalScanJobData> {
  if (!engagementGoalScanQueue) {
    engagementGoalScanQueue = new Queue<EngagementGoalScanJobData>(
      QUEUE_NAMES.ENGAGEMENT_GOAL_SCAN,
      {
        connection: createRedisConnection(),
        defaultJobOptions: {
          attempts: 2,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: { count: 5 },
          removeOnFail: { count: 10 },
        },
      }
    );
  }
  return engagementGoalScanQueue;
}

/**
 * Registers (or replaces) the daily engagement-goal scan cron job.
 * Runs at 06:00 UTC every day. Checks active engagement goals and fires
 * in-app notifications when targets are reached.
 */
export async function scheduleEngagementGoalScan(): Promise<void> {
  const queue = getEngagementGoalScanQueue();
  await queue.upsertJobScheduler(
    "engagement-goal-scan-daily",
    { pattern: "0 6 * * *" },
    {
      name: "engagement-goal-scan-daily",
      data: { triggeredAt: new Date().toISOString() },
      opts: {
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { count: 5 },
        removeOnFail: { count: 10 },
      },
    }
  );
}

// ── Token Health Scan Queue ────────────────────────────────────────────────────

let tokenHealthScanQueue: Queue<TokenHealthScanJobData> | null = null;

function getTokenHealthScanQueue(): Queue<TokenHealthScanJobData> {
  if (!tokenHealthScanQueue) {
    tokenHealthScanQueue = new Queue<TokenHealthScanJobData>(
      QUEUE_NAMES.TOKEN_HEALTH_SCAN,
      {
        connection: createRedisConnection(),
        defaultJobOptions: {
          attempts: 2,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: { count: 5 },
          removeOnFail: { count: 10 },
        },
      }
    );
  }
  return tokenHealthScanQueue;
}

/**
 * Registers (or replaces) the daily token health scan cron job.
 * Runs at 07:00 UTC every day. Computes health status for all active
 * social accounts and notifies users of expiring/expired tokens.
 */
export async function scheduleTokenHealthScan(): Promise<void> {
  const queue = getTokenHealthScanQueue();
  await queue.upsertJobScheduler(
    "token-health-scan-daily",
    { pattern: "0 7 * * *" },
    {
      name: "token-health-scan-daily",
      data: { triggeredAt: new Date().toISOString() },
      opts: {
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { count: 5 },
        removeOnFail: { count: 10 },
      },
    }
  );
}

// ── Content Digest Queue ───────────────────────────────────────────────────────

let contentDigestQueue: Queue<ContentDigestJobData> | null = null;

function getContentDigestQueue(): Queue<ContentDigestJobData> {
  if (!contentDigestQueue) {
    contentDigestQueue = new Queue<ContentDigestJobData>(
      QUEUE_NAMES.CONTENT_DIGEST,
      {
        connection: createRedisConnection(),
        defaultJobOptions: {
          attempts: 2,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: { count: 5 },
          removeOnFail: { count: 10 },
        },
      }
    );
  }
  return contentDigestQueue;
}

/**
 * Registers (or replaces) the hourly content digest cron job.
 * Runs at the top of every hour. The worker checks each user's
 * configured dayOfWeek/hourUTC to determine if their digest is due.
 */
export async function scheduleContentDigest(): Promise<void> {
  const queue = getContentDigestQueue();
  await queue.upsertJobScheduler(
    "content-digest-hourly",
    { pattern: "0 * * * *" },
    {
      name: "content-digest-hourly",
      data: { triggeredAt: new Date().toISOString() },
      opts: {
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { count: 5 },
        removeOnFail: { count: 10 },
      },
    }
  );
}

// ── Daily Briefing Queue ───────────────────────────────────────────────────────

let dailyBriefingQueue: Queue<DailyBriefingJobData> | null = null;

function getDailyBriefingQueue(): Queue<DailyBriefingJobData> {
  if (!dailyBriefingQueue) {
    dailyBriefingQueue = new Queue<DailyBriefingJobData>(
      QUEUE_NAMES.DAILY_BRIEFING,
      {
        connection: createRedisConnection(),
        defaultJobOptions: {
          attempts: 2,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: { count: 5 },
          removeOnFail: { count: 10 },
        },
      }
    );
  }
  return dailyBriefingQueue;
}

/**
 * Registers (or replaces) the daily briefing cron job.
 * Runs at 08:00 UTC every day.
 */
export async function scheduleDailyBriefing(): Promise<void> {
  const queue = getDailyBriefingQueue();
  await queue.upsertJobScheduler(
    "daily-briefing-daily",
    { pattern: "0 8 * * *" },
    {
      name: "daily-briefing-daily",
      data: { triggeredAt: new Date().toISOString() },
      opts: {
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { count: 5 },
        removeOnFail: { count: 10 },
      },
    }
  );
}
