import crypto from "crypto";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export type WebhookEvent =
  | "post.published"
  | "post.failed"
  | "post.partially_published";

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: Record<string, unknown>;
}

function signPayload(secret: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

async function deliverWebhook(
  url: string,
  secret: string,
  payload: WebhookPayload
): Promise<void> {
  const body = JSON.stringify(payload);
  const signature = signPayload(secret, body);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PostFlow-Signature": `sha256=${signature}`,
        "X-PostFlow-Event": payload.event,
      },
      body,
      signal: controller.signal,
    });

    if (!res.ok) {
      logger.warn(
        { url, status: res.status, event: payload.event },
        "Webhook delivery returned non-2xx status"
      );
    }
  } catch (err) {
    logger.error({ err, url, event: payload.event }, "Webhook delivery failed");
  } finally {
    clearTimeout(timeout);
  }
}

export async function dispatchWebhooks(
  userId: string,
  event: WebhookEvent,
  data: Record<string, unknown>
): Promise<void> {
  let configs: { url: string; secret: string }[];

  try {
    configs = await prisma.webhookConfig.findMany({
      where: { userId, isActive: true, events: { has: event } },
      select: { url: true, secret: true },
    });
  } catch (err) {
    logger.error({ err, userId, event }, "Failed to fetch webhook configs");
    return;
  }

  if (configs.length === 0) return;

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  // Fire-and-forget — do not await individual deliveries to avoid blocking
  void Promise.allSettled(
    configs.map((cfg) => deliverWebhook(cfg.url, cfg.secret, payload))
  );
}
