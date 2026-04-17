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
import {
  scheduleTokenExpiryCheck,
  scheduleExpiringTokenRefreshes,
} from "../src/lib/queue/scheduler";
import { workerLogger } from "../src/lib/logger";

// ── Start workers ──────────────────────────────────────────────────────────────

const publishWorker = createPublishWorker();
const tokenRefreshWorker = createTokenRefreshWorker();
const tokenExpiryCheckWorker = createTokenExpiryCheckWorker();

workerLogger.info("Publish worker started");
workerLogger.info("Token refresh worker started");
workerLogger.info("Token expiry check worker started");

// ── Register daily repeatable cron ────────────────────────────────────────────
// Registers the BullMQ repeatable job (daily at 02:00 UTC) for token expiry
// checks. Idempotent — safe to call on every startup.

async function registerCronJobs(): Promise<void> {
  try {
    await scheduleTokenExpiryCheck();
    workerLogger.info("Registered daily token expiry check cron (02:00 UTC)");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    workerLogger.error({ err: message }, "Failed to register token expiry cron");
  }
}

// ── Initial token refresh scan ────────────────────────────────────────────────
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

// ── Graceful shutdown ──────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  workerLogger.info({ signal }, "Received signal, shutting down gracefully");

  await Promise.all([
    publishWorker.close(),
    tokenRefreshWorker.close(),
    tokenExpiryCheckWorker.close(),
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
