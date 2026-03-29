import { Worker, Job } from "bullmq";
import { prisma } from "@/lib/db";
import { encryptToken, decryptToken } from "@/lib/encryption";
import { exchangeForLongLivedToken } from "@/lib/auth/meta-oauth";
import { createRedisConnection, QUEUE_NAMES } from "../connection";

// ── Job payload types ──────────────────────────────────────────────────────────

export interface TokenRefreshJobData {
  socialAccountId: string;
}

// ── Worker processor ───────────────────────────────────────────────────────────

async function processTokenRefreshJob(
  job: Job<TokenRefreshJobData>
): Promise<void> {
  const { socialAccountId } = job.data;

  const account = await prisma.socialAccount.findUnique({
    where: { id: socialAccountId },
  });

  if (!account || !account.isActive) {
    // Account gone or deactivated — nothing to do
    return;
  }

  if (!account.tokenExpiresAt) {
    // Token never expires (e.g. page token) — skip
    return;
  }

  const decryptedToken = decryptToken(account.encryptedToken);

  const { accessToken: newToken, expiresIn } =
    await exchangeForLongLivedToken(decryptedToken);

  const newExpiresAt = new Date(Date.now() + expiresIn * 1000);
  const encrypted = encryptToken(newToken);

  await prisma.socialAccount.update({
    where: { id: socialAccountId },
    data: {
      encryptedToken: encrypted,
      tokenExpiresAt: newExpiresAt,
    },
  });
}

// ── Worker factory ─────────────────────────────────────────────────────────────

/**
 * Creates and returns a BullMQ Worker for the token refresh queue.
 * Call this in the standalone worker process (workers/queue-worker.ts).
 */
export function createTokenRefreshWorker(): Worker<TokenRefreshJobData> {
  const connection = createRedisConnection();

  const worker = new Worker<TokenRefreshJobData>(
    QUEUE_NAMES.TOKEN_REFRESH,
    processTokenRefreshJob,
    {
      connection,
      concurrency: 3,
    }
  );

  worker.on(
    "failed",
    (job: Job<TokenRefreshJobData> | undefined, error: Error) => {
      const accountId = job?.data.socialAccountId ?? "unknown";
      console.error(
        `[TokenRefreshWorker] Failed to refresh token for account ${accountId}:`,
        error.message
      );
    }
  );

  worker.on("error", (error: Error) => {
    console.error("[TokenRefreshWorker] Worker error:", error.message);
  });

  return worker;
}
