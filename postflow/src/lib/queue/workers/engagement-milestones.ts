import { Worker, type Job } from "bullmq";
import { PublishStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createRedisConnection, QUEUE_NAMES } from "../connection";
import { createNotification } from "@/lib/notifications";
import { workerLogger } from "@/lib/logger";

export interface EngagementMilestoneScanJobData {
  triggeredAt: string;
}

// Default milestone thresholds per metric
const MILESTONE_THRESHOLDS: Record<string, number[]> = {
  impressions: [100, 500, 1000, 5000, 10000, 50000, 100000],
  reach: [100, 500, 1000, 5000, 10000, 50000, 100000],
  likes: [10, 50, 100, 500, 1000, 5000, 10000],
  comments: [5, 10, 50, 100, 500, 1000],
  shares: [5, 10, 50, 100, 500, 1000],
};

export function formatMilestoneThreshold(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

async function scanMilestones(): Promise<void> {
  const publishResults = await prisma.publishResult.findMany({
    where: { status: PublishStatus.PUBLISHED, insights: { isNot: null } },
    include: {
      insights: true,
      post: { select: { id: true, userId: true, content: true } },
    },
  });

  for (const result of publishResults) {
    const insights = result.insights;
    if (!insights) continue;

    const { id: postId, userId, content } = result.post;

    const metricValues: Record<string, number> = {
      impressions: insights.impressions ?? 0,
      reach: insights.reach ?? 0,
      likes: insights.likes ?? 0,
      comments: insights.comments ?? 0,
      shares: insights.shares ?? 0,
    };

    for (const [metric, thresholds] of Object.entries(MILESTONE_THRESHOLDS)) {
      const currentValue = metricValues[metric] ?? 0;

      for (const threshold of thresholds) {
        if (currentValue >= threshold) {
          try {
            const milestone = await prisma.postEngagementMilestone.create({
              data: { userId, postId, metric, threshold },
            });

            const preview =
              content.length > 60 ? content.slice(0, 60) + "…" : content;
            createNotification({
              userId,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              type: "engagement.milestone" as any,
              title: `🎉 Post hit ${formatMilestoneThreshold(threshold)} ${metric}!`,
              body: `"${preview}" reached ${formatMilestoneThreshold(threshold)} ${metric}.`,
              entityId: postId,
              entityType: "post",
            });

            workerLogger.info(
              { milestoneId: milestone.id, postId, metric, threshold },
              "Engagement milestone achieved"
            );
          } catch {
            // Unique constraint violation = already recorded, skip silently
          }
        }
      }
    }
  }
}

export function createEngagementMilestoneScanWorker(): Worker<EngagementMilestoneScanJobData> {
  return new Worker<EngagementMilestoneScanJobData>(
    QUEUE_NAMES.ENGAGEMENT_MILESTONE_SCAN,
    async (job: Job<EngagementMilestoneScanJobData>) => {
      workerLogger.info({ jobId: job.id }, "Engagement milestone scan started");
      await scanMilestones();
      workerLogger.info(
        { jobId: job.id },
        "Engagement milestone scan complete"
      );
    },
    {
      connection: createRedisConnection(),
      concurrency: 1,
    }
  );
}
