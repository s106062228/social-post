import { Worker, Job } from "bullmq";
import { Platform, PostStatus, PublishStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createRedisConnection, QUEUE_NAMES } from "../connection";
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
import type { PlatformAdapter } from "@/lib/platforms/types";
import { workerLogger } from "@/lib/logger";

// ── Job payloads ───────────────────────────────────────────────────────────────

export interface SyncInsightsJobData {
  postId: string;
}

export interface SyncInsightsScanJobData {
  triggeredAt: string;
}

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
};

// ── Per-post insights sync ─────────────────────────────────────────────────────

async function processSyncInsightsJob(
  job: Job<SyncInsightsJobData>
): Promise<void> {
  const { postId } = job.data;

  const publishResults = await prisma.publishResult.findMany({
    where: { postId, status: PublishStatus.PUBLISHED },
    select: {
      id: true,
      platform: true,
      accountId: true,
      platformPostId: true,
    },
  });

  if (publishResults.length === 0) return;

  const accountIds = [...new Set(publishResults.map((r) => r.accountId))];
  const accounts = await prisma.socialAccount.findMany({
    where: { id: { in: accountIds }, isActive: true },
    select: { id: true, encryptedToken: true, tokenExpiresAt: true },
  });
  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  for (const result of publishResults) {
    if (!result.platformPostId) continue;
    const account = accountMap.get(result.accountId);
    if (!account) continue;

    try {
      const token = await getTokenWithRefresh({
        id: result.accountId,
        encryptedToken: account.encryptedToken,
        tokenExpiresAt: account.tokenExpiresAt,
      });

      const adapter = adapters[result.platform];
      const raw = await adapter.getInsights(result.platformPostId, token);

      await prisma.postInsights.upsert({
        where: { publishResultId: result.id },
        update: {
          impressions: raw.impressions ?? null,
          reach: raw.reach ?? null,
          likes: raw.likes ?? null,
          comments: raw.comments ?? null,
          shares: raw.shares ?? null,
          syncedAt: new Date(),
        },
        create: {
          publishResultId: result.id,
          impressions: raw.impressions ?? null,
          reach: raw.reach ?? null,
          likes: raw.likes ?? null,
          comments: raw.comments ?? null,
          shares: raw.shares ?? null,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      workerLogger.warn(
        { postId, publishResultId: result.id, err: message },
        "Failed to sync insights for publish result"
      );
    }
  }
}

// ── Daily scan: dispatch per-post jobs ────────────────────────────────────────

async function processSyncInsightsScanJob(
  job: Job<SyncInsightsScanJobData>
): Promise<void> {
  workerLogger.info({ triggeredAt: job.data.triggeredAt }, "Starting insights sync scan");

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const posts = await prisma.post.findMany({
    where: {
      status: {
        in: [PostStatus.PUBLISHED, PostStatus.PARTIALLY_PUBLISHED],
      },
      updatedAt: { gte: thirtyDaysAgo },
    },
    select: { id: true },
  });

  // Import queue lazily to avoid circular dependency at module load
  const { Queue } = await import("bullmq");
  const queue = new Queue<SyncInsightsJobData>(QUEUE_NAMES.SYNC_INSIGHTS, {
    connection: createRedisConnection(),
  });

  for (const post of posts) {
    await queue.add(`sync-insights:${post.id}`, { postId: post.id });
  }

  await queue.close();

  workerLogger.info({ count: posts.length }, "Insights sync scan dispatched jobs");
}

// ── Worker factories ───────────────────────────────────────────────────────────

export function createSyncInsightsWorker(): Worker<SyncInsightsJobData> {
  const worker = new Worker<SyncInsightsJobData>(
    QUEUE_NAMES.SYNC_INSIGHTS,
    processSyncInsightsJob,
    {
      connection: createRedisConnection(),
      concurrency: 5,
    }
  );

  worker.on("failed", (job: Job<SyncInsightsJobData> | undefined, error: Error) => {
    workerLogger.error(
      { jobId: job?.id, err: error.message },
      "Sync insights job failed"
    );
  });

  worker.on("error", (error: Error) => {
    workerLogger.error({ err: error }, "SyncInsightsWorker error");
  });

  return worker;
}

export function createSyncInsightsScanWorker(): Worker<SyncInsightsScanJobData> {
  const worker = new Worker<SyncInsightsScanJobData>(
    QUEUE_NAMES.SYNC_INSIGHTS_SCAN,
    processSyncInsightsScanJob,
    {
      connection: createRedisConnection(),
      concurrency: 1,
    }
  );

  worker.on(
    "failed",
    (job: Job<SyncInsightsScanJobData> | undefined, error: Error) => {
      workerLogger.error(
        { jobId: job?.id, err: error.message },
        "Sync insights scan job failed"
      );
    }
  );

  worker.on("error", (error: Error) => {
    workerLogger.error({ err: error }, "SyncInsightsScanWorker error");
  });

  return worker;
}
