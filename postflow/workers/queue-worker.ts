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
 *  - Publish worker  (processes post publishing jobs)
 *  - Token refresh worker (refreshes expiring OAuth tokens)
 *  - A recurring cron to schedule token refreshes for expiring accounts
 */

import "dotenv/config";
import { createPublishWorker } from "../src/lib/queue/workers/publish";
import { createTokenRefreshWorker } from "../src/lib/queue/workers/refresh";
import { scheduleExpiringTokenRefreshes } from "../src/lib/queue/scheduler";

// ── Start workers ──────────────────────────────────────────────────────────────

const publishWorker = createPublishWorker();
const tokenRefreshWorker = createTokenRefreshWorker();

console.log("[Worker] Publish worker started");
console.log("[Worker] Token refresh worker started");

// ── Token expiry cron ──────────────────────────────────────────────────────────
// Check for tokens expiring within 7 days every 6 hours.

const TOKEN_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

async function runTokenRefreshScan(): Promise<void> {
  try {
    const count = await scheduleExpiringTokenRefreshes(7);
    if (count > 0) {
      console.log(
        `[Worker] Scheduled token refresh for ${count} expiring account(s)`
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Worker] Token refresh scan failed:", message);
  }
}

// Run immediately on startup, then on interval
runTokenRefreshScan();
const tokenScanInterval = setInterval(
  runTokenRefreshScan,
  TOKEN_REFRESH_INTERVAL_MS
);

// ── Graceful shutdown ──────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  console.log(`[Worker] Received ${signal}, shutting down gracefully...`);

  clearInterval(tokenScanInterval);

  await Promise.all([publishWorker.close(), tokenRefreshWorker.close()]);

  console.log("[Worker] All workers stopped. Exiting.");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("uncaughtException", (error: Error) => {
  console.error("[Worker] Uncaught exception:", error.message);
  shutdown("uncaughtException");
});

process.on("unhandledRejection", (reason: unknown) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  console.error("[Worker] Unhandled rejection:", message);
});
