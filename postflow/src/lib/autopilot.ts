import { type PrismaClient, TriggerType, ActionType } from "@prisma/client";
import { createNotification } from "@/lib/notifications";
import { workerLogger } from "@/lib/logger";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AutopilotRuleRecord {
  id: string;
  userId: string;
  name: string;
  trigger: TriggerType;
  conditionJson: Record<string, unknown>;
  action: ActionType;
  actionDataJson: Record<string, unknown>;
  isActive: boolean;
  lastTriggeredAt: Date | null;
  triggerCount: number;
}

export interface EvaluationResult {
  triggered: boolean;
  actionTaken?: string;
  error?: string;
}

// ── Trigger evaluators ────────────────────────────────────────────────────────

async function checkQueueEmpty(
  userId: string,
  condition: Record<string, unknown>,
  db: PrismaClient
): Promise<boolean> {
  const threshold =
    typeof condition.threshold === "number" ? condition.threshold : 3;
  const count = await db.post.count({
    where: { userId, status: "SCHEDULED" },
  });
  return count < threshold;
}

async function checkLowEngagement(
  userId: string,
  condition: Record<string, unknown>,
  db: PrismaClient
): Promise<boolean> {
  const threshold =
    typeof condition.threshold === "number" ? condition.threshold : 10;
  const since = new Date();
  since.setDate(since.getDate() - 7);

  const insights = await db.postInsights.findMany({
    where: {
      publishResult: { post: { userId }, publishedAt: { gte: since } },
    },
    select: { likes: true, comments: true, shares: true },
  });
  if (insights.length === 0) return false;

  const avgEngagement =
    insights.reduce(
      (sum: number, i: { likes: number | null; comments: number | null; shares: number | null }) =>
        sum + (i.likes ?? 0) + (i.comments ?? 0) + (i.shares ?? 0),
      0
    ) / insights.length;
  return avgEngagement < threshold;
}

async function checkPostingGap(
  userId: string,
  condition: Record<string, unknown>,
  db: PrismaClient
): Promise<boolean> {
  const hours = typeof condition.hours === "number" ? condition.hours : 24;
  const since = new Date();
  since.setHours(since.getHours() - hours);

  const lastPublished = await db.publishResult.findFirst({
    where: { post: { userId }, status: "PUBLISHED", publishedAt: { gte: since } },
    orderBy: { publishedAt: "desc" },
    select: { publishedAt: true },
  });
  return lastPublished === null;
}

async function checkEvergreenDue(
  userId: string,
  db: PrismaClient
): Promise<boolean> {
  const count = await db.post.count({
    where: {
      userId,
      isEvergreen: true,
      status: "PUBLISHED",
      recycleInterval: { not: null },
    },
  });
  return count > 0;
}

function checkDailySchedule(condition: Record<string, unknown>): boolean {
  const targetHour =
    typeof condition.hour === "number" ? condition.hour : -1;
  if (targetHour < 0 || targetHour > 23) return false;
  return new Date().getUTCHours() === targetHour;
}

// ── Action executors ──────────────────────────────────────────────────────────

async function executePublishEvergreen(
  userId: string,
  db: PrismaClient
): Promise<string> {
  // Find the least-recently-recycled evergreen post
  const source = await db.post.findFirst({
    where: { userId, isEvergreen: true, status: "PUBLISHED" },
    orderBy: [{ lastRecycledAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      content: true,
      mediaType: true,
      mediaUrls: true,
      firstComment: true,
    },
  });

  if (!source) return "No evergreen posts found";

  await db.post.create({
    data: {
      userId,
      content: source.content,
      mediaType: source.mediaType,
      mediaUrls: source.mediaUrls,
      firstComment: source.firstComment,
      status: "DRAFT",
      isEvergreen: true,
    },
  });

  await db.post.update({
    where: { id: source.id },
    data: { lastRecycledAt: new Date() },
  });

  return `Created draft from evergreen post ${source.id}`;
}

async function executeSendNotification(
  userId: string,
  ruleName: string,
  actionData: Record<string, unknown>
): Promise<string> {
  const title =
    typeof actionData.title === "string"
      ? actionData.title
      : `Autopilot: ${ruleName}`;
  const body =
    typeof actionData.body === "string"
      ? actionData.body
      : `Autopilot rule "${ruleName}" was triggered.`;

  createNotification({
    userId,
    type: "post.reminder" as never,
    title,
    body,
    entityType: "autopilot_rule",
  });
  return "Notification sent";
}

async function executeCreateFromTemplate(
  userId: string,
  db: PrismaClient
): Promise<string> {
  const template = await db.template.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { content: true, mediaType: true, mediaUrls: true },
  });
  if (!template) return "No templates found";

  await db.post.create({
    data: {
      userId,
      content: template.content,
      mediaType: template.mediaType,
      mediaUrls: template.mediaUrls,
      status: "DRAFT",
    },
  });
  return "Draft created from template";
}

// ── Main evaluator ────────────────────────────────────────────────────────────

export async function evaluateRule(
  rule: AutopilotRuleRecord,
  userId: string,
  db: PrismaClient
): Promise<EvaluationResult> {
  try {
    // Evaluate trigger
    let triggered = false;
    switch (rule.trigger) {
      case TriggerType.QUEUE_EMPTY:
        triggered = await checkQueueEmpty(userId, rule.conditionJson, db);
        break;
      case TriggerType.LOW_ENGAGEMENT:
        triggered = await checkLowEngagement(userId, rule.conditionJson, db);
        break;
      case TriggerType.POSTING_GAP:
        triggered = await checkPostingGap(userId, rule.conditionJson, db);
        break;
      case TriggerType.EVERGREEN_DUE:
        triggered = await checkEvergreenDue(userId, db);
        break;
      case TriggerType.DAILY_SCHEDULE:
        triggered = checkDailySchedule(rule.conditionJson);
        break;
    }

    if (!triggered) return { triggered: false };

    // Execute action
    let actionTaken: string;
    switch (rule.action) {
      case ActionType.PUBLISH_EVERGREEN:
        actionTaken = await executePublishEvergreen(userId, db);
        break;
      case ActionType.SEND_NOTIFICATION:
        actionTaken = await executeSendNotification(
          userId,
          rule.name,
          rule.actionDataJson
        );
        break;
      case ActionType.CREATE_FROM_TEMPLATE:
        actionTaken = await executeCreateFromTemplate(userId, db);
        break;
      case ActionType.PAUSE_PUBLISHING:
        await db.user.update({
          where: { id: userId },
          data: {
            publishingPaused: true,
            publishingPausedReason: `Autopilot rule "${rule.name}" triggered`,
            publishingPausedAt: new Date(),
          },
        });
        actionTaken = "Publishing paused";
        break;
      case ActionType.RESCHEDULE_POST:
        actionTaken = "Reschedule action not yet implemented";
        break;
      default:
        actionTaken = "Unknown action";
    }

    // Update rule stats
    await db.autopilotRule.update({
      where: { id: rule.id },
      data: {
        lastTriggeredAt: new Date(),
        triggerCount: { increment: 1 },
      },
    });

    return { triggered: true, actionTaken };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    workerLogger.error({ err: message, ruleId: rule.id }, "Autopilot rule evaluation error");
    return { triggered: false, error: message };
  }
}
