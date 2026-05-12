import { Worker, type Job } from "bullmq";
import { PostStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createRedisConnection, QUEUE_NAMES } from "../connection";
import { createNotification, NOTIFICATION_TYPES } from "@/lib/notifications";
import { logActivity } from "@/lib/activity-log";
import { logger } from "@/lib/logger";

// ── Job payload ────────────────────────────────────────────────────────────────

export interface PostExpiryJobData {
  postId: string;
  userId: string;
}

// ── Processor ─────────────────────────────────────────────────────────────────

async function processExpiryJob(job: Job<PostExpiryJobData>): Promise<void> {
  const { postId, userId } = job.data;

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, status: true, expiresAt: true },
  });

  if (!post) {
    logger.info({ postId }, "Expiry job skipped: post not found");
    return;
  }

  // Guard: expiry may have been cleared or pushed forward since the job was enqueued
  if (!post.expiresAt || post.expiresAt > new Date()) {
    logger.info({ postId }, "Expiry job skipped: no expiry or expiry is in the future");
    return;
  }

  const prevStatus = post.status;

  if (post.status === PostStatus.SCHEDULED) {
    await prisma.post.update({
      where: { id: postId },
      data: {
        status: PostStatus.DRAFT,
        scheduledAt: null,
        archivedAt: new Date(),
      },
    });
  } else if (
    post.status === PostStatus.PUBLISHED ||
    post.status === PostStatus.PARTIALLY_PUBLISHED
  ) {
    await prisma.post.update({
      where: { id: postId },
      data: { archivedAt: new Date() },
    });
  } else {
    logger.info({ postId, status: post.status }, "Expiry job: post status not actionable");
    return;
  }

  logActivity({
    userId,
    action: "post.expired",
    entityId: postId,
    entityType: "post",
    metadata: { previousStatus: prevStatus },
  });

  createNotification({
    userId,
    type: NOTIFICATION_TYPES.POST_EXPIRED,
    title: "Post expired and archived",
    body: "A post reached its expiry time and has been automatically archived.",
    entityId: postId,
    entityType: "post",
  });

  logger.info({ postId, prevStatus }, "Post expiry processed successfully");
}

// ── Worker factory ─────────────────────────────────────────────────────────────

export function createPostExpiryWorker(): Worker<PostExpiryJobData> {
  return new Worker<PostExpiryJobData>(
    QUEUE_NAMES.POST_EXPIRY,
    processExpiryJob,
    {
      connection: createRedisConnection(),
      concurrency: 5,
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 100 },
    }
  );
}
