import webpush from "web-push";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

let vapidInitialized = false;

function initVapid(): boolean {
  if (vapidInitialized) return true;

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const email = process.env.VAPID_EMAIL;

  if (!publicKey || !privateKey || !email) return false;

  webpush.setVapidDetails(email, publicKey, privateKey);
  vapidInitialized = true;
  return true;
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

export async function sendPushNotification(
  endpoint: string,
  p256dhKey: string,
  authKey: string,
  payload: PushPayload
): Promise<void> {
  if (!initVapid()) return;

  try {
    await webpush.sendNotification(
      { endpoint, keys: { p256dh: p256dhKey, auth: authKey } },
      JSON.stringify(payload)
    );
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 410 || status === 404) {
      // Subscription gone — clean up
      await prisma.pushSubscription.deleteMany({ where: { endpoint } });
      logger.info({ endpoint }, "push subscription removed (gone)");
    } else {
      logger.error({ err, endpoint }, "push notification send failed");
    }
  }
}

export async function notifyUserPush(
  userId: string,
  title: string,
  body: string,
  url?: string
): Promise<void> {
  if (!initVapid()) return;

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return;

  await Promise.allSettled(
    subs.map((sub: { endpoint: string; p256dhKey: string; authKey: string }) =>
      sendPushNotification(sub.endpoint, sub.p256dhKey, sub.authKey, {
        title,
        body,
        url,
      })
    )
  );
}
