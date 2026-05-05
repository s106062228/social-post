import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { IntegrationEvent } from "@/lib/slack-notify";

const EVENT_LABELS: Record<IntegrationEvent, string> = {
  "post.published": "Post Published",
  "post.failed": "Post Failed",
  "post.partially_published": "Post Partially Published",
};

const EVENT_COLORS: Record<IntegrationEvent, number> = {
  "post.published": 0x22c55e,
  "post.failed": 0xef4444,
  "post.partially_published": 0xf97316,
};

function buildDiscordEmbed(
  event: IntegrationEvent,
  postId: string
): Record<string, unknown> {
  const label = EVENT_LABELS[event];
  const color = EVENT_COLORS[event];

  return {
    embeds: [
      {
        title: `PostFlow: ${label}`,
        color,
        fields: [
          { name: "Event", value: event, inline: true },
          { name: "Post ID", value: postId, inline: true },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: "PostFlow Notifications" },
      },
    ],
  };
}

async function sendToDiscord(
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
        "Discord notification returned non-2xx status"
      );
    }
  } catch (err) {
    logger.error({ err, url: webhookUrl }, "Discord notification delivery failed");
  } finally {
    clearTimeout(timeout);
  }
}

export async function dispatchDiscordNotifications(
  userId: string,
  event: IntegrationEvent,
  postId: string
): Promise<void> {
  let integrations: { webhookUrl: string }[];

  try {
    integrations = await prisma.discordIntegration.findMany({
      where: { userId, isActive: true, events: { has: event } },
      select: { webhookUrl: true },
    });
  } catch (err) {
    logger.error({ err, userId, event }, "Failed to fetch Discord integrations");
    return;
  }

  if (integrations.length === 0) return;

  const payload = buildDiscordEmbed(event, postId);

  void Promise.allSettled(
    integrations.map((i) => sendToDiscord(i.webhookUrl, payload))
  );
}
