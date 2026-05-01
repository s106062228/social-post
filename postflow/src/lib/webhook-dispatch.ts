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
  configId: string,
  url: string,
  secret: string,
  payload: WebhookPayload
): Promise<void> {
  const body = JSON.stringify(payload);
  const signature = signPayload(secret, body);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  const startMs = Date.now();

  let statusCode: number | undefined;
  let success = false;

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

    statusCode = res.status;
    success = res.ok;

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
    const durationMs = Date.now() - startMs;

    // Fire-and-forget delivery log — never throw
    prisma.webhookDelivery
      .create({
        data: {
          configId,
          event: payload.event,
          statusCode: statusCode ?? null,
          success,
          durationMs,
        },
      })
      .catch((err: unknown) => {
        logger.error({ err, configId, event: payload.event }, "Failed to log webhook delivery");
      });
  }
}

export async function dispatchWebhooks(
  userId: string,
  event: WebhookEvent,
  data: Record<string, unknown>
): Promise<void> {
  let configs: { id: string; url: string; secret: string }[];

  try {
    configs = await prisma.webhookConfig.findMany({
      where: { userId, isActive: true, events: { has: event } },
      select: { id: true, url: true, secret: true },
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
    configs.map((cfg) => deliverWebhook(cfg.id, cfg.url, cfg.secret, payload))
  );
}
