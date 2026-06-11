/**
 * PostFlow Queue Worker — standalone process
 *
 * This file is the entry point for the BullMQ worker process.
 * Run it separately from the Next.js app:
 *
 *   npx tsx workers/queue-worker.ts
 *   # or in Docker: node --import tsx/esm workers/queue-worker.ts
 *
 * It starts:
 *  - Publish worker            (processes post publishing jobs)
 *  - Token refresh worker      (refreshes expiring OAuth tokens)
 *  - Token expiry check worker (handles the daily cron check job)
 *
 * On startup it also registers the daily BullMQ repeatable job for token
 * expiry checks (idempotent — BullMQ deduplicates by job key).
 */

import "dotenv/config";
import { createPublishWorker } from "../src/lib/queue/workers/publish";
import { createTokenRefreshWorker } from "../src/lib/queue/workers/refresh";
import { createTokenExpiryCheckWorker } from "../src/lib/queue/workers/token-expiry";
import { createRecurringScheduleWorker } from "../src/lib/queue/workers/recurring-schedule";
import {
  createSyncInsightsWorker,
  createSyncInsightsScanWorker,
} from "../src/lib/queue/workers/sync-insights";
import { createRssImportWorker } from "../src/lib/queue/workers/rss-import";
import { createReportWorker } from "../src/lib/queue/workers/report";
import { createReminderWorker } from "../src/lib/queue/workers/reminder";
import { createPerformanceAlertWorker } from "../src/lib/queue/workers/performance-alert";
import { createPostExpiryWorker } from "../src/lib/queue/workers/expiry";
import { createDigestWorker } from "../src/lib/queue/workers/digest";
import { createAudienceSyncWorker } from "../src/lib/queue/workers/audience-sync";
import { createEvergreenRecycleWorker } from "../src/lib/queue/workers/evergreen-recycle";
import { createCoachingWorker } from "../src/lib/queue/workers/coaching";
import { createEngagementGoalWorker } from "../src/lib/queue/workers/engagement-goals";
import { createTokenHealthWorker } from "../src/lib/queue/workers/token-health";
import { createContentDigestWorker } from "../src/lib/queue/workers/content-digest";
import { createDailyBriefingWorker } from "../src/lib/queue/workers/daily-briefing";
import {
  scheduleTokenExpiryCheck,
  scheduleExpiringTokenRefreshes,
  scheduleRecurringCheck,
  scheduleSyncInsightsScan,
  scheduleRssImport,
  scheduleReportScan,
  schedulePerformanceAlertScan,
  scheduleDigest,
  scheduleAudienceSync,
  scheduleEvergreenRecycle,
  scheduleCoachingScan,
  scheduleEngagementGoalScan,
  scheduleTokenHealthScan,
  scheduleContentDigest,
  scheduleDailyBriefing,
} from "../src/lib/queue/scheduler";
import { workerLogger } from "../src/lib/logger";

// ── Start workers ──────────────────────────────────────────────────────────────

const publishWorker = createPublishWorker();
const tokenRefreshWorker = createTokenRefreshWorker();
const tokenExpiryCheckWorker = createTokenExpiryCheckWorker();
const recurringScheduleWorker = createRecurringScheduleWorker();
const syncInsightsWorker = createSyncInsightsWorker();
const syncInsightsScanWorker = createSyncInsightsScanWorker();
const rssImportWorker = createRssImportWorker();
const reportWorker = createReportWorker();
const reminderWorker = createReminderWorker();
const performanceAlertWorker = createPerformanceAlertWorker();
const postExpiryWorker = createPostExpiryWorker();
const digestWorker = createDigestWorker();
const audienceSyncWorker = createAudienceSyncWorker();
const evergreenRecycleWorker = createEvergreenRecycleWorker();
const coachingWorker = createCoachingWorker();
const engagementGoalWorker = createEngagementGoalWorker();
const tokenHealthWorker = createTokenHealthWorker();
const contentDigestWorker = createContentDigestWorker();
const dailyBriefingWorker = createDailyBriefingWorker();

workerLogger.info("Publish worker started");
workerLogger.info("Token refresh worker started");
workerLogger.info("Token expiry check worker started");
workerLogger.info("Recurring schedule worker started");
workerLogger.info("Sync insights worker started");
workerLogger.info("Sync insights scan worker started");
workerLogger.info("RSS import worker started");
workerLogger.info("Report worker started");
workerLogger.info("Reminder worker started");
workerLogger.info("Performance alert worker started");
workerLogger.info("Post expiry worker started");
workerLogger.info("Notification digest worker started");
workerLogger.info("Audience sync worker started");
workerLogger.info("Evergreen recycle worker started");
workerLogger.info("Coaching worker started");
workerLogger.info("Engagement goal worker started");
workerLogger.info("Token health worker started");
workerLogger.info("Content digest worker started");
workerLogger.info("Daily briefing worker started");

// ── Register repeatable cron jobs ─────────────────────────────────────────────

async function registerCronJobs(): Promise<void> {
  try {
    await scheduleTokenExpiryCheck();
    workerLogger.info("Registered daily token expiry check cron (02:00 UTC)");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    workerLogger.error({ err: message }, "Failed to register token expiry cron");
  }

  try {
    await scheduleRecurringCheck();
    workerLogger.info("Registered minutely recurring schedule check cron");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    workerLogger.error({ err: message }, "Failed to register recurring schedule cron");
  }

  try {
    await scheduleSyncInsightsScan();
    workerLogger.info("Registered daily insights sync cron (03:00 UTC)");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    workerLogger.error({ err: message }, "Failed to register insights sync cron");
  }

  try {
    await scheduleRssImport();
    workerLogger.info("Registered hourly RSS import cron");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    workerLogger.error({ err: message }, "Failed to register RSS import cron");
  }

  try {
    await scheduleReportScan();
    workerLogger.info("Registered daily report scan cron (08:00 UTC)");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    workerLogger.error({ err: message }, "Failed to register report scan cron");
  }

  try {
    await schedulePerformanceAlertScan();
    workerLogger.info("Registered daily performance alert scan cron (04:00 UTC)");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    workerLogger.error({ err: message }, "Failed to register performance alert scan cron");
  }

  try {
    await scheduleDigest();
    workerLogger.info("Registered weekly notification digest cron (Mon 09:00 UTC)");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    workerLogger.error({ err: message }, "Failed to register digest cron");
  }

  try {
    await scheduleAudienceSync();
    workerLogger.info("Registered daily audience sync cron (05:00 UTC)");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    workerLogger.error({ err: message }, "Failed to register audience sync cron");
  }

  try {
    await scheduleEvergreenRecycle();
    workerLogger.info("Registered daily evergreen recycle cron (03:00 UTC)");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    workerLogger.error({ err: message }, "Failed to register evergreen recycle cron");
  }

  try {
    await scheduleCoachingScan();
    workerLogger.info("Registered weekly coaching scan cron (Sun 01:00 UTC)");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    workerLogger.error({ err: message }, "Failed to register coaching scan cron");
  }

  try {
    await scheduleEngagementGoalScan();
    workerLogger.info("Registered daily engagement goal scan cron (06:00 UTC)");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    workerLogger.error({ err: message }, "Failed to register engagement goal scan cron");
  }

  try {
    await scheduleTokenHealthScan();
    workerLogger.info("Registered daily token health scan cron (07:00 UTC)");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    workerLogger.error({ err: message }, "Failed to register token health scan cron");
  }

  try {
    await scheduleContentDigest();
    workerLogger.info("Registered hourly content digest cron");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    workerLogger.error({ err: message }, "Failed to register content digest cron");
  }

  try {
    await scheduleDailyBriefing();
    workerLogger.info("Registered daily briefing cron (08:00 UTC)");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    workerLogger.error({ err: message }, "Failed to register daily briefing cron");
  }
}

// ── Initial token refresh scan ────────────────────────────────────────────
// On startup, immediately schedule any token refreshes that are already due
// within the 7-day window (covers gaps when the worker was offline).

async function runInitialTokenRefreshScan(): Promise<void> {
  try {
    const count = await scheduleExpiringTokenRefreshes(7);
    if (count > 0) {
      workerLogger.info(
        { count },
        "Scheduled token refresh for expiring accounts (startup scan)"
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    workerLogger.error({ err: message }, "Startup token refresh scan failed");
  }
}

registerCronJobs();
runInitialTokenRefreshScan();

// ── Graceful shutdown ────────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  workerLogger.info({ signal }, "Received signal, shutting down gracefully");

  await Promise.all([
    publishWorker.close(),
    tokenRefreshWorker.close(),
    tokenExpiryCheckWorker.close(),
    recurringScheduleWorker.close(),
    syncInsightsWorker.close(),
    syncInsightsScanWorker.close(),
    rssImportWorker.close(),
    reportWorker.close(),
    reminderWorker.close(),
    performanceAlertWorker.close(),
    postExpiryWorker.close(),
    digestWorker.close(),
    audienceSyncWorker.close(),
    evergreenRecycleWorker.close(),
    coachingWorker.close(),
    engagementGoalWorker.close(),
    tokenHealthWorker.close(),
    contentDigestWorker.close(),
    dailyBriefingWorker.close(),
  ]);

  workerLogger.info("All workers stopped. Exiting.");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("uncaughtException", (error: Error) => {
  workerLogger.error({ err: error }, "Uncaught exception");
  shutdown("uncaughtException");
});

process.on("unhandledRejection", (reason: unknown) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  workerLogger.error({ err: message }, "Unhandled rejection");
});
