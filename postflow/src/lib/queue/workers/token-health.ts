import { Worker, type Job } from "bullmq";
import { prisma } from "@/lib/db";
import { createRedisConnection, QUEUE_NAMES } from "../connection";
import { createNotification, NOTIFICATION_TYPES } from "@/lib/notifications";
import { workerLogger } from "@/lib/logger";

// ── Job payload ────────────────────────────────────────────────────────────────

export interface TokenHealthScanJobData {
  triggeredAt: string;
}

// ── Health status computation ─────────────────────────────────────────────────

type TokenHealthStatus = "ok" | "expiring" | "expired" | "invalid";

export function computeTokenHealthStatus(
  tokenExpiresAt: Date | null,
  isActive: boolean
): TokenHealthStatus {
  if (!isActive) return "invalid";
  if (!tokenExpiresAt) return "ok"; // no expiry = permanent token
  const now = new Date();
  if (tokenExpiresAt < now) return "expired";
  const daysLeft = (tokenExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (daysLeft <= 7) return "expiring";
  return "ok";
}

// ── Worker ─────────────────────────────────────────────────────────────────────

export function createTokenHealthWorker(): Worker<TokenHealthScanJobData> {
  return new Worker<TokenHealthScanJobData>(
    QUEUE_NAMES.TOKEN_HEALTH_SCAN,
    async (job: Job<TokenHealthScanJobData>) => {
      workerLogger.info(
        { jobId: job.id, triggeredAt: job.data.triggeredAt },
        "Token health scan started"
      );

      const accounts = await prisma.socialAccount.findMany({
        where: { isActive: true },
        select: {
          id: true,
          userId: true,
          accountName: true,
          platform: true,
          tokenExpiresAt: true,
          tokenHealthStatus: true,
        },
      });

      let updated = 0;
      let notified = 0;

      for (const account of accounts) {
        try {
          const newStatus = computeTokenHealthStatus(
            account.tokenExpiresAt,
            true
          );
          const prevStatus = account.tokenHealthStatus as TokenHealthStatus | null;

          await prisma.socialAccount.update({
            where: { id: account.id },
            data: {
              tokenHealthStatus: newStatus,
              tokenHealthCheckedAt: new Date(),
            },
          });
          updated++;

          // Notify when transitioning into an unhealthy state
          const wasHealthy = !prevStatus || prevStatus === "ok";
          const isUnhealthy = newStatus === "expiring" || newStatus === "expired";

          if (wasHealthy && isUnhealthy) {
            const title =
              newStatus === "expired"
                ? `${account.accountName} connection expired`
                : `${account.accountName} connection expiring soon`;
            const body =
              newStatus === "expired"
                ? `Your ${account.platform} account connection has expired. Please reconnect to continue publishing.`
                : `Your ${account.platform} account token expires within 7 days. Reconnect soon to avoid interruptions.`;

            createNotification({
              userId: account.userId,
              type: NOTIFICATION_TYPES.POST_FAILED,
              title,
              body,
              entityId: account.id,
              entityType: "social_account",
            });
            notified++;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          workerLogger.warn(
            { accountId: account.id, err: msg },
            "Token health check failed for account"
          );
        }
      }

      workerLogger.info(
        { total: accounts.length, updated, notified },
        "Token health scan completed"
      );
    },
    {
      connection: createRedisConnection(),
      concurrency: 1,
    }
  );
}
