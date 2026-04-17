import { Worker, Job } from "bullmq";
import { prisma } from "@/lib/db";
import { createRedisConnection, QUEUE_NAMES } from "../connection";
import { scheduleExpiringTokenRefreshes } from "../scheduler";
import { workerLogger } from "@/lib/logger";

// ── Job payload ────────────────────────────────────────────────────────────────

export interface TokenExpiryCheckJobData {
  triggeredAt: string; // ISO timestamp for audit logging
}

// ── Worker processor ───────────────────────────────────────────────────────────

async function processTokenExpiryCheckJob(
  job: Job<TokenExpiryCheckJobData>
): Promise<void> {
  workerLogger.info({ triggeredAt: job.data.triggeredAt }, "Starting token expiry check");

  // Step 1: Deactivate accounts whose tokens are already expired
  const { count: deactivatedCount } = await prisma.socialAccount.updateMany({
    where: {
      isActive: true,
      tokenExpiresAt: { not: null, lt: new Date() },
    },
    data: { isActive: false },
  });

  if (deactivatedCount > 0) {
    workerLogger.warn(
      { count: deactivatedCount },
      "Deactivated social accounts with expired tokens"
    );
  }

  // Step 2: Schedule refreshes for tokens expiring within 7 days
  const scheduledCount = await scheduleExpiringTokenRefreshes(7);

  workerLogger.info(
    { deactivatedCount, scheduledCount },
    "Token expiry check completed"
  );
}

// ── Worker factory ─────────────────────────────────────────────────────────────

/**
 * Creates a BullMQ Worker for the token expiry check queue.
 * This worker processes jobs enqueued by the daily repeatable cron.
 */
export function createTokenExpiryCheckWorker(): Worker<TokenExpiryCheckJobData> {
  const connection = createRedisConnection();

  const worker = new Worker<TokenExpiryCheckJobData>(
    QUEUE_NAMES.TOKEN_EXPIRY_CHECK,
    processTokenExpiryCheckJob,
    {
      connection,
      concurrency: 1,
    }
  );

  worker.on("failed", (job: Job<TokenExpiryCheckJobData> | undefined, error: Error) => {
    workerLogger.error(
      { jobId: job?.id, err: error.message },
      "Token expiry check job failed"
    );
  });

  worker.on("error", (error: Error) => {
    workerLogger.error({ err: error }, "TokenExpiryCheckWorker error");
  });

  return worker;
}
