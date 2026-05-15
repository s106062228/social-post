import { Worker, type Job } from "bullmq";
import { PostStatus, MediaType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createRedisConnection, QUEUE_NAMES } from "../connection";
import { createNotification, NOTIFICATION_TYPES } from "@/lib/notifications";
import { logActivity } from "@/lib/activity-log";
import { logger } from "@/lib/logger";

// ── Job payload ────────────────────────────────────────────────────────────────

export interface EvergreenRecycleJobData {
  triggeredAt: string;
}

// ── Processor ─────────────────────────────────────────────────────────────────

async function processEvergreenRecycleJob(
  job: Job<EvergreenRecycleJobData>
): Promise<void> {
  logger.info({ triggeredAt: job.data.triggeredAt }, "Evergreen recycle scan started");

  const now = new Date();

  // Find evergreen PUBLISHED posts that have a recycleInterval set and are due
  const posts = await prisma.post.findMany({
    where: {
      isEvergreen: true,
      status: PostStatus.PUBLISHED,
      recycleInterval: { not: null },
      archivedAt: null,
    },
    select: {
      id: true,
      userId: true,
      content: true,
      mediaType: true,
      mediaUrls: true,
      recycleInterval: true,
      lastRecycledAt: true,
    },
  });

  let recycledCount = 0;
  let skippedCount = 0;

  for (const post of posts) {
    const intervalDays = post.recycleInterval!;
    const lastRecycled = post.lastRecycledAt;

    // Check if due: never recycled OR recycled more than intervalDays ago
    const dueDate = lastRecycled
      ? new Date(lastRecycled.getTime() + intervalDays * 24 * 60 * 60 * 1000)
      : null;

    if (dueDate && dueDate > now) {
      skippedCount++;
      continue;
    }

    try {
      const newPost = await prisma.post.create({
        data: {
          userId: post.userId,
          content: post.content,
          mediaType: post.mediaType as MediaType,
          mediaUrls: post.mediaUrls,
          status: PostStatus.DRAFT,
          scheduledAt: null,
          isEvergreen: true,
        },
        select: { id: true },
      });

      await prisma.post.update({
        where: { id: post.id },
        data: { lastRecycledAt: now },
      });

      logActivity({
        userId: post.userId,
        action: "post.auto_recycled",
        entityId: newPost.id,
        entityType: "post",
        metadata: { sourcePostId: post.id, intervalDays },
      });

      createNotification({
        userId: post.userId,
        type: NOTIFICATION_TYPES.POST_RECYCLED,
        title: "Evergreen post recycled",
        body: `An evergreen post was automatically recycled as a new draft (every ${intervalDays} days).`,
        entityId: newPost.id,
        entityType: "post",
      });

      recycledCount++;
      logger.info({ sourcePostId: post.id, newPostId: newPost.id, intervalDays }, "Evergreen post recycled");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ postId: post.id, err: message }, "Failed to recycle evergreen post");
    }
  }

  logger.info({ recycledCount, skippedCount, total: posts.length }, "Evergreen recycle scan complete");
}

// ── Worker factory ─────────────────────────────────────────────────────────────

export function createEvergreenRecycleWorker(): Worker<EvergreenRecycleJobData> {
  return new Worker<EvergreenRecycleJobData>(
    QUEUE_NAMES.EVERGREEN_RECYCLE,
    processEvergreenRecycleJob,
    {
      connection: createRedisConnection(),
      concurrency: 1,
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 20 },
    }
  );
}
