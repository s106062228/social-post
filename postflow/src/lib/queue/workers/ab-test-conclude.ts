import { Worker, Job } from "bullmq";
import { prisma } from "@/lib/db";
import { createRedisConnection, QUEUE_NAMES } from "../connection";
import { workerLogger } from "@/lib/logger";
import { computeABStats } from "@/lib/ab-stats";

// ── Job payload ────────────────────────────────────────────────────────────────

export interface ABTestConcludeScanJobData {
  triggeredAt: string;
}

// ── Worker ─────────────────────────────────────────────────────────────────────

export function createABTestConcludeWorker(): Worker<ABTestConcludeScanJobData> {
  return new Worker<ABTestConcludeScanJobData>(
    QUEUE_NAMES.AB_TEST_CONCLUDE_SCAN,
    async (job: Job<ABTestConcludeScanJobData>) => {
      workerLogger.info({ jobId: job.id }, "A/B test conclude scan started");

      const now = new Date(job.data.triggeredAt);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Find all open A/B tests (no winner yet) that are at least 7 days old
      const openTests = await prisma.postABTest.findMany({
        where: {
          winner: null,
          createdAt: { lte: sevenDaysAgo },
        },
        select: {
          id: true,
          userId: true,
          postA: {
            select: {
              publishResults: {
                select: {
                  insights: {
                    select: {
                      impressions: true,
                      reach: true,
                      likes: true,
                      comments: true,
                      shares: true,
                    },
                  },
                },
              },
            },
          },
          postB: {
            select: {
              publishResults: {
                select: {
                  insights: {
                    select: {
                      impressions: true,
                      reach: true,
                      likes: true,
                      comments: true,
                      shares: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      let concluded = 0;
      let skipped = 0;

      for (const test of openTests) {
        try {
          const flatA = test.postA.publishResults.flatMap((r) => r.insights);
          const flatB = test.postB.publishResults.flatMap((r) => r.insights);

          const metricsA = flatA.reduce(
            (acc, ins) => ({
              impressions: acc.impressions + ins.impressions,
              reach: acc.reach + ins.reach,
              likes: acc.likes + ins.likes,
              comments: acc.comments + ins.comments,
              shares: acc.shares + ins.shares,
            }),
            { impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0 }
          );

          const metricsB = flatB.reduce(
            (acc, ins) => ({
              impressions: acc.impressions + ins.impressions,
              reach: acc.reach + ins.reach,
              likes: acc.likes + ins.likes,
              comments: acc.comments + ins.comments,
              shares: acc.shares + ins.shares,
            }),
            { impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0 }
          );

          const stats = computeABStats(metricsA, metricsB);

          if (!stats.hasSufficientData || !stats.isSignificant) {
            skipped++;
            continue;
          }

          const notes =
            `Auto-concluded: ${stats.confidenceLevel}% confidence, ` +
            `Z-score: ${stats.zScore.toFixed(2)}, ` +
            `effect size: ${stats.effect.toFixed(1)}%`;

          await prisma.postABTest.update({
            where: { id: test.id },
            data: {
              winner: stats.winnerLead,
              notes,
            },
          });

          workerLogger.info(
            { testId: test.id, winner: stats.winnerLead, confidence: stats.confidenceLevel },
            "A/B test auto-concluded"
          );

          concluded++;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          workerLogger.error({ err: message, testId: test.id }, "Failed to conclude A/B test");
        }
      }

      workerLogger.info({ concluded, skipped }, "A/B test conclude scan completed");
    },
    { connection: createRedisConnection() }
  );
}
