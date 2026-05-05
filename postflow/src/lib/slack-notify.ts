import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export type IntegrationEvent =
  | "post.published"
  | "post.failed"
  | "post.partially_published";

const EVENT_LABELS: Record<IntegrationEvent, string> = {
  "post.published": "Post Published",
  "post.failed": "Post Failed",
  "post.partially_published": "Post Partially Published",
};

const EVENT_COLORS: Record<IntegrationEvent, string> = {
  "post.published": "#22c55e",
  "post.failed": "#ef4444",
  "post.partially_published": "#f97316",
};

function buildSlackBlocks(
  event: IntegrationEvent,
  postId: string
): Record<string, unknown> {
  const label = EVENT_LABELS[event];
  const color = EVENT_COLORS[event];

  return {
    attachments: [
      {
        color,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*PostFlow:* ${label}`,
            },
          },
          {
            type: "section",
            fields: [
              {
                type: "mrkdwn",
                text: `*Event:*\n${event}`,
              },
              {
                type: "mrkdwn",
                text: `*Post ID:*\n${postId}`,
              },
            ],
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `<!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} at {time}|${new Date().toISOString()}>`,
              },
            ],
          },
        ],
      },
    ],
  };
}

async function sendToSlack(
  webhookUrl: string,
  payload: Record<string, unknown>
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      logger.warn(
        { url: webhookUrl, status: res.status },
        "Slack notification returned non-2xx status"
      );
    }
  } catch (err) {
    logger.error({ err, url: webhookUrl }, "Slack notification delivery failed");
  } finally {
    clearTimeout(timeout);
  }
}

export async function dispatchSlackNotifications(
  userId: string,
  event: IntegrationEvent,
  postId: string
): Promise<void> {
  let integrations: { webhookUrl: string }[];

  try {
    integrations = await prisma.slackIntegration.findMany({
      where: { userId, isActive: true, events: { has: event } },
      select: { webhookUrl: true },
    });
  } catch (err) {
    logger.error({ err, userId, event }, "Failed to fetch Slack integrations");
    return;
  }

  if (integrations.length === 0) return;

  const payload = buildSlackBlocks(event, postId);

  void Promise.allSettled(
    integrations.map((i) => sendToSlack(i.webhookUrl, payload))
  );
}
