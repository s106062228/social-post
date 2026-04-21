import { Worker, Job } from "bullmq";
import { MediaType, PostStatus } from "@prisma/client";
import { CronExpressionParser } from "cron-parser";
import { prisma } from "@/lib/db";
import { createRedisConnection, QUEUE_NAMES } from "../connection";
import { schedulePublish } from "../scheduler";
import { workerLogger } from "@/lib/logger";

// ── Job payload ────────────────────────────────────────────────────────────────

export interface RecurringScheduleJobData {
  triggeredAt: string;
}

// ── Next run calculator ────────────────────────────────────────────────────────

function getNextRunAt(cronExpr: string, timezone: string): Date | null {
  try {
    const interval = CronExpressionParser.parse(cronExpr, {
      tz: timezone,
    });
    return interval.next().toDate();
  } catch {
    return null;
  }
}

// ── Worker processor ───────────────────────────────────────────────────────────

async function processRecurringScheduleJob(
  job: Job<RecurringScheduleJobData>
): Promise<void> {
  workerLogger.info(
    { triggeredAt: job.data.triggeredAt },
    "Processing recurring schedules"
  );

  const now = new Date();

  // Find all active schedules that are due
  const dueSchedules = await prisma.recurringSchedule.findMany({
    where: {
      isActive: true,
      nextRunAt: { lte: now },
    },
    include: {
      user: {
        include: {
          accounts: {
            where: { isActive: true },
            select: { id: true, platform: true },
          },
        },
      },
    },
  });

  if (dueSchedules.length === 0) {
    return;
  }

  workerLogger.info({ count: dueSchedules.length }, "Found due recurring schedules");

  for (const schedule of dueSchedules) {
    try {
      // Filter accounts to only those matching the schedule's platforms
      const matchingAccounts = schedule.user.accounts.filter((a) =>
        schedule.platforms.includes(a.platform)
      );

      if (matchingAccounts.length === 0) {
        workerLogger.warn(
          { scheduleId: schedule.id },
          "No active accounts for recurring schedule platforms — skipping"
        );
        // Still advance nextRunAt so it doesn't get stuck
        const nextRunAt = getNextRunAt(schedule.cronExpr, schedule.timezone);
        await prisma.recurringSchedule.update({
          where: { id: schedule.id },
          data: { lastRunAt: now, nextRunAt },
        });
        continue;
      }

      // Create a new Post from the schedule
      const post = await prisma.post.create({
        data: {
          userId: schedule.userId,
          content: schedule.content,
          mediaType: schedule.mediaType as MediaType,
          mediaUrls: schedule.mediaUrls,
          status: PostStatus.PUBLISHING,
        },
      });

      // Dispatch to publish queue
      await schedulePublish({
        postId: post.id,
        accountIds: matchingAccounts.map((a) => a.id),
      });

      // Advance the schedule
      const nextRunAt = getNextRunAt(schedule.cronExpr, schedule.timezone);
      await prisma.recurringSchedule.update({
        where: { id: schedule.id },
        data: { lastRunAt: now, nextRunAt },
      });

      workerLogger.info(
        { scheduleId: schedule.id, postId: post.id, nextRunAt },
        "Recurring schedule fired — post created"
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      workerLogger.error(
        { scheduleId: schedule.id, err: message },
        "Failed to process recurring schedule"
      );
    }
  }
}

// ── Worker factory ─────────────────────────────────────────────────────────────

export function createRecurringScheduleWorker(): Worker<RecurringScheduleJobData> {
  const connection = createRedisConnection();

  const worker = new Worker<RecurringScheduleJobData>(
    QUEUE_NAMES.RECURRING_SCHEDULE,
    processRecurringScheduleJob,
    {
      connection,
      concurrency: 1,
    }
  );

  worker.on("failed", (job: Job<RecurringScheduleJobData> | undefined, error: Error) => {
    workerLogger.error(
      { jobId: job?.id, err: error.message },
      "Recurring schedule job failed"
    );
  });

  worker.on("error", (error: Error) => {
    workerLogger.error({ err: error }, "RecurringScheduleWorker error");
  });

  return worker;
}
