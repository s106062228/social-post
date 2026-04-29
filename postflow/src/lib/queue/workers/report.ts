import { Worker, Job } from "bullmq";
import { Platform, PostStatus, PublishStatus, ReportFrequency } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { createRedisConnection, QUEUE_NAMES } from "../connection";
import { workerLogger } from "@/lib/logger";
import { computeNextSendAt } from "@/app/api/report-schedules/route";

// ── Job payload ────────────────────────────────────────────────────────────────

export interface ReportScanJobData {
  triggeredAt: string;
}

// ── Analytics helpers ──────────────────────────────────────────────────────────

interface AnalyticsSummary {
  totalPosts: number;
  publishedPosts: number;
  failedPosts: number;
  scheduledPosts: number;
  draftPosts: number;
  overallSuccessRate: number;
  platformBreakdown: { platform: Platform; published: number; failed: number }[];
}

async function buildAnalyticsSummary(userId: string): Promise<AnalyticsSummary> {
  const [totalPosts, publishedPosts, failedPosts, scheduledPosts, draftPosts, allResults] =
    await Promise.all([
      prisma.post.count({ where: { userId } }),
      prisma.post.count({ where: { userId, status: PostStatus.PUBLISHED } }),
      prisma.post.count({ where: { userId, status: PostStatus.FAILED } }),
      prisma.post.count({ where: { userId, status: PostStatus.SCHEDULED } }),
      prisma.post.count({ where: { userId, status: PostStatus.DRAFT } }),
      prisma.publishResult.findMany({
        where: { post: { userId } },
        select: { platform: true, status: true },
      }),
    ]);

  const total = allResults.length;
  const totalPublished = allResults.filter((r) => r.status === PublishStatus.PUBLISHED).length;
  const overallSuccessRate = total > 0 ? Math.round((totalPublished / total) * 100) : 0;

  const platformBreakdown = Object.values(Platform).map((platform) => {
    const results = allResults.filter((r) => r.platform === platform);
    return {
      platform,
      published: results.filter((r) => r.status === PublishStatus.PUBLISHED).length,
      failed: results.filter((r) => r.status === PublishStatus.FAILED).length,
    };
  });

  return { totalPosts, publishedPosts, failedPosts, scheduledPosts, draftPosts, overallSuccessRate, platformBreakdown };
}

// ── Email template ─────────────────────────────────────────────────────────────

function frequencyLabel(f: ReportFrequency): string {
  return f === ReportFrequency.DAILY ? "Daily" : f === ReportFrequency.WEEKLY ? "Weekly" : "Monthly";
}

function buildReportHtml(summary: AnalyticsSummary, frequency: ReportFrequency): string {
  const platformRows = summary.platformBreakdown
    .map(
      (p) =>
        `<tr>
          <td style="padding:6px 12px;border-bottom:1px solid #eee;">${p.platform}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;color:#16a34a;">${p.published}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;color:#dc2626;">${p.failed}</td>
        </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>PostFlow ${frequencyLabel(frequency)} Report</title></head>
<body style="font-family:sans-serif;background:#f9fafb;margin:0;padding:24px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:#6366f1;padding:24px 32px;">
      <h1 style="color:#fff;margin:0;font-size:20px;">PostFlow ${frequencyLabel(frequency)} Report</h1>
      <p style="color:#e0e7ff;margin:4px 0 0;font-size:14px;">Generated ${new Date().toUTCString()}</p>
    </div>
    <div style="padding:24px 32px;">
      <h2 style="font-size:16px;color:#374151;margin:0 0 16px;">Post Summary</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr><td style="padding:6px 0;color:#6b7280;">Total Posts</td><td style="padding:6px 0;font-weight:600;text-align:right;">${summary.totalPosts}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Published</td><td style="padding:6px 0;font-weight:600;text-align:right;color:#16a34a;">${summary.publishedPosts}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Failed</td><td style="padding:6px 0;font-weight:600;text-align:right;color:#dc2626;">${summary.failedPosts}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Scheduled</td><td style="padding:6px 0;font-weight:600;text-align:right;color:#2563eb;">${summary.scheduledPosts}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Drafts</td><td style="padding:6px 0;font-weight:600;text-align:right;">${summary.draftPosts}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Overall Success Rate</td><td style="padding:6px 0;font-weight:600;text-align:right;">${summary.overallSuccessRate}%</td></tr>
      </table>
      <h2 style="font-size:16px;color:#374151;margin:0 0 12px;">Platform Breakdown</h2>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;">Platform</th>
            <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;">Published</th>
            <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;">Failed</th>
          </tr>
        </thead>
        <tbody>${platformRows}</tbody>
      </table>
    </div>
    <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:12px;color:#9ca3af;">You are receiving this because you set up a ${frequencyLabel(frequency).toLowerCase()} report in PostFlow. Manage your report preferences in Settings → Reports.</p>
    </div>
  </div>
</body>
</html>`;
}

// ── Worker processor ───────────────────────────────────────────────────────────

async function processReportScanJob(job: Job<ReportScanJobData>): Promise<void> {
  workerLogger.info({ triggeredAt: job.data.triggeredAt }, "Report scan triggered");

  const now = new Date();

  const dueSchedules = await prisma.reportSchedule.findMany({
    where: { isActive: true, nextSendAt: { lte: now } },
    select: {
      id: true,
      userId: true,
      frequency: true,
      recipientEmail: true,
    },
  });

  if (dueSchedules.length === 0) {
    workerLogger.info("No due report schedules found");
    return;
  }

  workerLogger.info({ count: dueSchedules.length }, "Processing due report schedules");

  for (const schedule of dueSchedules) {
    try {
      const summary = await buildAnalyticsSummary(schedule.userId);
      const html = buildReportHtml(summary, schedule.frequency);

      await sendEmail({
        to: schedule.recipientEmail,
        subject: `PostFlow ${frequencyLabel(schedule.frequency)} Analytics Report`,
        html,
      });

      await prisma.reportSchedule.update({
        where: { id: schedule.id },
        data: {
          lastSentAt: now,
          nextSendAt: computeNextSendAt(schedule.frequency, now),
        },
      });

      workerLogger.info(
        { scheduleId: schedule.id, userId: schedule.userId },
        "Report sent successfully"
      );
    } catch (err) {
      workerLogger.error({ err, scheduleId: schedule.id }, "Failed to send report");
    }
  }
}

// ── Worker factory ─────────────────────────────────────────────────────────────

export function createReportWorker(): Worker<ReportScanJobData> {
  const connection = createRedisConnection();

  const worker = new Worker<ReportScanJobData>(
    QUEUE_NAMES.REPORT,
    processReportScanJob,
    { connection, concurrency: 1 }
  );

  worker.on("failed", (job, err) => {
    workerLogger.error({ jobId: job?.id, err }, "Report scan job failed");
  });

  return worker;
}
