import { prisma } from "@/lib/db";
import { PostStatus } from "@prisma/client";
import { logger } from "@/lib/logger";

export const NOTIFICATION_TYPES = {
  POST_PUBLISHED: "post.published",
  POST_FAILED: "post.failed",
  POST_PARTIALLY_PUBLISHED: "post.partially_published",
  POST_APPROVAL_REQUESTED: "post.approval_requested",
  POST_APPROVED: "post.approved",
  POST_REJECTED: "post.rejected",
  POST_REMINDER: "post.reminder",
  POST_EXPIRED: "post.expired",
} as const;

export type NotificationType =
  (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  entityId?: string;
  entityType?: string;
}

async function isInAppEnabled(
  userId: string,
  type: NotificationType
): Promise<boolean> {
  try {
    const pref = await prisma.notificationPreference.findUnique({
      where: { userId_notificationType: { userId, notificationType: type } },
      select: { inApp: true },
    });
    return pref?.inApp ?? true;
  } catch {
    return true;
  }
}

export function createNotification(input: CreateNotificationInput): void {
  _createNotificationAsync(input).catch((err: unknown) => {
    logger.error({ err }, "Failed to create notification");
  });
}

async function _createNotificationAsync(
  input: CreateNotificationInput
): Promise<void> {
  const enabled = await isInAppEnabled(input.userId, input.type);
  if (!enabled) return;

  await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      entityId: input.entityId ?? null,
      entityType: input.entityType ?? null,
    },
  });
}

export function notifyPostOutcomeInApp(
  postId: string,
  userId: string,
  finalStatus: PostStatus
): void {
  if (finalStatus === PostStatus.PUBLISHED) {
    createNotification({
      userId,
      type: NOTIFICATION_TYPES.POST_PUBLISHED,
      title: "Post published successfully",
      body: "Your post has been published to all selected platforms.",
      entityId: postId,
      entityType: "post",
    });
  } else if (finalStatus === PostStatus.PARTIALLY_PUBLISHED) {
    createNotification({
      userId,
      type: NOTIFICATION_TYPES.POST_PARTIALLY_PUBLISHED,
      title: "Post partially published",
      body: "Your post was published to some platforms but failed on others.",
      entityId: postId,
      entityType: "post",
    });
  } else if (finalStatus === PostStatus.FAILED) {
    createNotification({
      userId,
      type: NOTIFICATION_TYPES.POST_FAILED,
      title: "Post failed to publish",
      body: "Your post could not be published. Please check the post details and retry.",
      entityId: postId,
      entityType: "post",
    });
  }
}
