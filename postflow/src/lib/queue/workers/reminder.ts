import { Worker, type Job } from "bullmq";
import { PostStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createRedisConnection, QUEUE_NAMES } from "../connection";
import { createNotification, NOTIFICATION_TYPES } from "@/lib/notifications";
import { logger } from "@/lib/logger";

// ── Job payload ────────────────────────────────────────────────────────────────

export interface ReminderJobData {
  postId: string;
  userId: string;
  scheduledAt: string; // ISO string
}

// ── Processor ─────────────────────────────────────────────────────────────────

async function processReminderJob(job: Job<ReminderJobData>): Promise<void> {
  const { postId, userId, scheduledAt } = job.data;

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, status: true },
  });

  if (!post || post.status !== PostStatus.SCHEDULED) {
    logger.info(
      { postId, status: post?.status },
      "Reminder skipped: post not found or no longer SCHEDULED"
    );
    return;
  }

  const publishTime = new Date(scheduledAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

  createNotification({
    userId,
    type: NOTIFICATION_TYPES.POST_REMINDER,
    title: "Your post is publishing soon",
    body: `A scheduled post is set to publish at ${publishTime}.`,
    entityId: postId,
    entityType: "post",
  });
}

// ── Worker factory ─────────────────────────────────────────────────────────────

export function createReminderWorker(): Worker<ReminderJobData> {
  return new Worker<ReminderJobData>(
    QUEUE_NAMES.REMINDER,
    processReminderJob,
    {
      connection: createRedisConnection(),
      concurrency: 5,
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 100 },
    }
  );
}
