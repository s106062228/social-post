import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export type ActivityAction =
  | "post.created"
  | "post.updated"
  | "post.deleted"
  | "post.published"
  | "post.retried"
  | "post.duplicated"
  | "template.created"
  | "template.deleted"
  | "schedule.created"
  | "schedule.deleted"
  | "schedule.toggled"
  | "account.connected"
  | "account.disconnected"
  | "post.version_restored"
  | "post.approval_requested"
  | "post.approved"
  | "post.rejected"
  | "post.imported";

export interface LogActivityOptions {
  userId: string;
  action: ActivityAction;
  entityId?: string;
  entityType?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Fire-and-forget activity logger. Failures are swallowed so they never
 * block the calling request.
 */
export function logActivity(opts: LogActivityOptions): void {
  prisma.activityLog
    .create({
      data: {
        userId: opts.userId,
        action: opts.action,
        entityId: opts.entityId ?? null,
        entityType: opts.entityType ?? null,
        metadata: opts.metadata ? JSON.parse(JSON.stringify(opts.metadata)) : undefined,
      },
    })
    .catch((err: unknown) => {
      logger.error({ err, ...opts }, "Failed to write activity log");
    });
}
