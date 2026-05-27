import { Worker, type Job } from "bullmq";
import {
  GoalPeriod,
  Platform,
  PublishStatus,
  EngagementMetric,
  EngagementAggregation,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { createRedisConnection, QUEUE_NAMES } from "../connection";
import { createNotification, NOTIFICATION_TYPES } from "@/lib/notifications";
import { computeScore } from "@/lib/content-score";
import { workerLogger } from "@/lib/logger";

// ── Job payload ────────────────────────────────────────────────────────────────

export interface EngagementGoalScanJobData {
  triggeredAt: string;
}

// ── Goal record type ───────────────────────────────────────────────────────────

interface EngagementGoalRecord {
  id: string;
  userId: string;
  name: string;
  metric: EngagementMetric;
  targetValue: number;
  aggregation: EngagementAggregation;
  period: GoalPeriod;
  platform: Platform | null;
  isActive: boolean;
  lastNotifiedAt: Date | null;
}

// ── Period window helper ───────────────────────────────────────────────────────

function getPeriodWindow(period: GoalPeriod): { from: Date; to: Date } {
  const now = new Date();

  if (period === GoalPeriod.DAILY) {
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    const to = new Date(now);
    to.setHours(23, 59, 59, 999);
    return { from, to };
  }

  if (period === GoalPeriod.WEEKLY) {
    const from = new Date(now);
    const day = from.getDay();
    from.setDate(from.getDate() - day);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(from.getDate() + 6);
    to.setHours(23, 59, 59, 999);
    return { from, to };
  }

  // MONTHLY
  const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const to = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  );
  return { from, to };
}

// ── Metric extractor ───────────────────────────────────────────────────────────

interface InsightValues {
  impressions: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
}

function extractMetricValue(
  insight: InsightValues,
  metric: EngagementMetric
): number {
  switch (metric) {
    case EngagementMetric.IMPRESSIONS:
      return insight.impressions ?? 0;
    case EngagementMetric.REACH:
      return insight.reach ?? 0;
    case EngagementMetric.LIKES:
      return insight.likes ?? 0;
    case EngagementMetric.COMMENTS:
      return insight.comments ?? 0;
    case EngagementMetric.SHARES:
      return insight.shares ?? 0;
    case EngagementMetric.SCORE:
      return computeScore({
        impressions: insight.impressions ?? 0,
        reach: insight.reach ?? 0,
        likes: insight.likes ?? 0,
        comments: insight.comments ?? 0,
        shares: insight.shares ?? 0,
      });
    default:
      return 0;
  }
}

// ── Worker ─────────────────────────────────────────────────────────────────────

export function createEngagementGoalWorker(): Worker<EngagementGoalScanJobData> {
  return new Worker<EngagementGoalScanJobData>(
    QUEUE_NAMES.ENGAGEMENT_GOAL_SCAN,
    async (job: Job<EngagementGoalScanJobData>) => {
      workerLogger.info(
        { jobId: job.id, triggeredAt: job.data.triggeredAt },
        "Engagement goal scan started"
      );

      const goals = (await prisma.engagementGoal.findMany({
        where: { isActive: true },
      })) as EngagementGoalRecord[];

      let notified = 0;
      let skipped = 0;

      for (const goal of goals) {
        try {
          const { from, to } = getPeriodWindow(goal.period);

          // Skip if already notified in this period (don't spam)
          if (goal.lastNotifiedAt && goal.lastNotifiedAt >= from) {
            skipped++;
            continue;
          }

          const platformFilter: { platform?: Platform } = {};
          if (goal.platform) {
            platformFilter.platform = goal.platform;
          }

          const insights = await prisma.postInsights.findMany({
            where: {
              publishResult: {
                post: { userId: goal.userId },
                status: PublishStatus.PUBLISHED,
                publishedAt: { gte: from, lte: to },
                ...platformFilter,
              },
            },
            select: {
              impressions: true,
              reach: true,
              likes: true,
              comments: true,
              shares: true,
            },
          });

          if (insights.length === 0) {
            skipped++;
            continue;
          }

          const values = insights.map((ins: InsightValues) =>
            extractMetricValue(ins, goal.metric)
          );
          const total = values.reduce((s: number, v: number) => s + v, 0);
          const currentValue =
            goal.aggregation === EngagementAggregation.TOTAL
              ? total
              : total / values.length;

          // Check if goal has been achieved
          if (currentValue < goal.targetValue) {
            skipped++;
            continue;
          }

          // Goal achieved — send notification
          const metricLabel =
            goal.metric.charAt(0) + goal.metric.slice(1).toLowerCase();
          const aggLabel =
            goal.aggregation === EngagementAggregation.TOTAL ? "total" : "avg";
          const periodLabel =
            goal.period === GoalPeriod.DAILY
              ? "today"
              : goal.period === GoalPeriod.WEEKLY
                ? "this week"
                : "this month";
          const currentRounded = Math.round(currentValue * 10) / 10;

          await createNotification({
            userId: goal.userId,
            type: NOTIFICATION_TYPES.POST_PUBLISHED, // reuse as generic milestone
            title: `🎯 Engagement goal reached: ${goal.name}`,
            body: `${aggLabel === "avg" ? "Average" : "Total"} ${metricLabel} ${periodLabel}: ${currentRounded} / ${goal.targetValue}`,
          });

          await prisma.engagementGoal.update({
            where: { id: goal.id },
            data: { lastNotifiedAt: new Date() },
          });

          notified++;
        } catch (goalErr) {
          const msg =
            goalErr instanceof Error ? goalErr.message : String(goalErr);
          workerLogger.error(
            { goalId: goal.id, err: msg },
            "Error processing engagement goal"
          );
        }
      }

      workerLogger.info(
        { total: goals.length, notified, skipped },
        "Engagement goal scan completed"
      );
    },
    {
      connection: createRedisConnection(),
      concurrency: 1,
    }
  );
}
