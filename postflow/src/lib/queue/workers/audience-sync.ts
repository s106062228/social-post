import { Worker, Job } from "bullmq";
import { Platform } from "@prisma/client";
import { prisma } from "@/lib/db";
import { decryptToken } from "@/lib/encryption";
import { createRedisConnection, QUEUE_NAMES } from "../connection";
import { workerLogger } from "@/lib/logger";

// ── Job payload ────────────────────────────────────────────────────────────────

export interface AudienceSyncJobData {
  triggeredAt: string;
}

// ── Platform-specific follower fetch ─────────────────────────────────────────

interface FollowerCounts {
  followersCount: number | null;
  followingCount: number | null;
}

async function fetchFacebookFollowers(
  platformAccountId: string,
  encryptedToken: string
): Promise<FollowerCounts> {
  const token = decryptToken(encryptedToken);
  const url = `https://graph.facebook.com/v21.0/${platformAccountId}?fields=fan_count&access_token=${token}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Facebook API error: ${res.status}`);
  }
  const data = (await res.json()) as { fan_count?: number };
  return {
    followersCount: data.fan_count ?? null,
    followingCount: null,
  };
}

async function fetchInstagramFollowers(
  platformAccountId: string,
  encryptedToken: string
): Promise<FollowerCounts> {
  const token = decryptToken(encryptedToken);
  const url = `https://graph.facebook.com/v21.0/${platformAccountId}?fields=followers_count,follows_count&access_token=${token}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Instagram API error: ${res.status}`);
  }
  const data = (await res.json()) as {
    followers_count?: number;
    follows_count?: number;
  };
  return {
    followersCount: data.followers_count ?? null,
    followingCount: data.follows_count ?? null,
  };
}

async function fetchTwitterFollowers(
  encryptedToken: string
): Promise<FollowerCounts> {
  const rawToken = decryptToken(encryptedToken);
  const parsed = JSON.parse(rawToken) as { accessToken?: string };
  const bearerToken = parsed.accessToken;
  if (!bearerToken) {
    throw new Error("Missing Twitter access token");
  }

  const url =
    "https://api.twitter.com/2/users/me?user.fields=public_metrics";
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${bearerToken}` },
  });
  if (!res.ok) {
    throw new Error(`Twitter API error: ${res.status}`);
  }
  const data = (await res.json()) as {
    data?: { public_metrics?: { followers_count?: number; following_count?: number } };
  };
  const metrics = data.data?.public_metrics;
  return {
    followersCount: metrics?.followers_count ?? null,
    followingCount: metrics?.following_count ?? null,
  };
}

// ── Worker ─────────────────────────────────────────────────────────────────────

export function createAudienceSyncWorker(): Worker<AudienceSyncJobData> {
  return new Worker<AudienceSyncJobData>(
    QUEUE_NAMES.AUDIENCE_SYNC,
    async (job: Job<AudienceSyncJobData>) => {
      workerLogger.info({ jobId: job.id }, "Audience sync started");

      const accounts = await prisma.socialAccount.findMany({
        where: { isActive: true },
        select: {
          id: true,
          platform: true,
          platformAccountId: true,
          encryptedToken: true,
        },
      });

      let synced = 0;
      let skipped = 0;
      let failed = 0;

      for (const account of accounts) {
        try {
          let counts: FollowerCounts;

          switch (account.platform) {
            case Platform.FACEBOOK:
              counts = await fetchFacebookFollowers(
                account.platformAccountId,
                account.encryptedToken
              );
              break;
            case Platform.INSTAGRAM:
              counts = await fetchInstagramFollowers(
                account.platformAccountId,
                account.encryptedToken
              );
              break;
            case Platform.TWITTER:
              counts = await fetchTwitterFollowers(account.encryptedToken);
              break;
            default:
              // Platform not supported for audience sync — skip gracefully
              skipped++;
              continue;
          }

          await prisma.audienceMetric.create({
            data: {
              accountId: account.id,
              followersCount: counts.followersCount,
              followingCount: counts.followingCount,
            },
          });

          synced++;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          workerLogger.warn(
            { accountId: account.id, platform: account.platform, err: message },
            "Failed to sync audience metrics for account"
          );
          failed++;
        }
      }

      workerLogger.info(
        { synced, skipped, failed, total: accounts.length },
        "Audience sync complete"
      );
    },
    {
      connection: createRedisConnection(),
      concurrency: 1,
    }
  );
}
