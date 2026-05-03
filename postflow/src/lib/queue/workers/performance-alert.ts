import { Worker, type Job } from "bullmq";
import { AlertMetric, AlertOperator, Platform, PublishStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createRedisConnection, QUEUE_NAMES } from "../connection";
import { createNotification, NOTIFICATION_TYPES } from "@/lib/notifications";
import { computeScore } from "@/lib/content-score";
import { workerLogger } from "@/lib/logger";

// ── Job payload ────────────────────────────────────────────────────────────────

export interface PerformanceAlertScanJobData {
  triggeredAt: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function periodToCutoff(period: string): Date {
  const days = period === "30d" ? 30 : 7;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

interface AggregatedMetrics {
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  score: number;
  sampleSize: number;
}

async function getAggregatedMetrics(
  userId: string,
  cutoff: Date,
  platform?: Platform | null
): Promise<AggregatedMetrics> {
  const insights = await prisma.postInsights.findMany({
    where: {
      publishResult: {
        post: { userId },
        status: PublishStatus.PUBLISHED,
        publishedAt: { gte: cutoff },
        ...(platform ? { platform } : {}),
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
    return { impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0, score: 0, sampleSize: 0 };
  }

  const sum = insights.reduce(
    (acc, r) => ({
      impressions: acc.impressions + (r.impressions ?? 0),
      reach: acc.reach + (r.reach ?? 0),
      likes: acc.likes + (r.likes ?? 0),
      comments: acc.comments + (r.comments ?? 0),
      shares: acc.shares + (r.shares ?? 0),
    }),
    { impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0 }
  );

  const n = insights.length;
  const avg = {
    impressions: sum.impressions / n,
    reach: sum.reach / n,
    likes: sum.likes / n,
    comments: sum.comments / n,
    shares: sum.shares / n,
  };

  return {
    ...avg,
    score: computeScore(avg),
    sampleSize: n,
  };
}

function getMetricValue(metrics: AggregatedMetrics, metric: AlertMetric): number {
  switch (metric) {
    case AlertMetric.IMPRESSIONS: return metrics.impressions;
    case AlertMetric.REACH: return metrics.reach;
    case AlertMetric.LIKES: return metrics.likes;
    case AlertMetric.COMMENTS: return metrics.comments;
    case AlertMetric.SHARES: return metrics.shares;
    case AlertMetric.SCORE: return metrics.score;
    default: return 0;
  }
}

function conditionMet(value: number, operator: AlertOperator, threshold: number): boolean {
  return operator === AlertOperator.ABOVE ? value > threshold : value < threshold;
}

function metricLabel(metric: AlertMetric): string {
  return metric.charAt(0) + metric.slice(1).toLowerCase();
}

function operatorLabel(operator: AlertOperator): string {
  return operator === AlertOperator.ABOVE ? "above" : "below";
}

// ── Processor ─────────────────────────────────────────────────────────────────

async function processPerformanceAlertScanJob(
  job: Job<PerformanceAlertScanJobData>
): Promise<void> {
  workerLogger.info({ triggeredAt: job.data.triggeredAt }, "Performance alert scan triggered");

  const alerts = await prisma.performanceAlert.findMany({
    where: { isActive: true },
    select: {
      id: true,
      userId: true,
      name: true,
      metric: true,
      operator: true,
      threshold: true,
      platform: true,
      period: true,
    },
  });

  if (alerts.length === 0) {
    workerLogger.info("No active performance alerts found");
    return;
  }

  workerLogger.info({ count: alerts.length }, "Evaluating performance alerts");

  for (const alert of alerts) {
    try {
      const cutoff = periodToCutoff(alert.period);
      const metrics = await getAggregatedMetrics(alert.userId, cutoff, alert.platform);

      if (metrics.sampleSize === 0) continue;

      const value = getMetricValue(metrics, alert.metric);
      if (!conditionMet(value, alert.operator, alert.threshold)) continue;

      const platformLabel = alert.platform ? ` on ${alert.platform}` : "";
      const body = `Your average ${metricLabel(alert.metric)}${platformLabel} is ${Math.round(value)} (${operatorLabel(alert.operator)} your threshold of ${alert.threshold}) over the last ${alert.period}.`;

      createNotification({
        userId: alert.userId,
        type: NOTIFICATION_TYPES.POST_PUBLISHED,
        title: `Performance Alert: ${alert.name}`,
        body,
        entityType: "performance_alert",
        entityId: alert.id,
      });

      await prisma.performanceAlert.update({
        where: { id: alert.id },
        data: { lastTriggeredAt: new Date() },
      });

      workerLogger.info(
        { alertId: alert.id, userId: alert.userId, metric: alert.metric, value },
        "Performance alert triggered"
      );
    } catch (err) {
      workerLogger.error({ err, alertId: alert.id }, "Failed to evaluate performance alert");
    }
  }
}

// ── Worker factory ─────────────────────────────────────────────────────────────

export function createPerformanceAlertWorker(): Worker<PerformanceAlertScanJobData> {
  const connection = createRedisConnection();

  const worker = new Worker<PerformanceAlertScanJobData>(
    QUEUE_NAMES.PERFORMANCE_ALERT_SCAN,
    processPerformanceAlertScanJob,
    { connection, concurrency: 1 }
  );

  worker.on("failed", (job, err) => {
    workerLogger.error({ jobId: job?.id, err }, "Performance alert scan job failed");
  });

  return worker;
}
