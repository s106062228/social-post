import Redis from "ioredis";

// Singleton publisher connection — created lazily
let publisher: Redis | null = null;

function getPublisher(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  if (!publisher) {
    publisher = new Redis(url, {
      lazyConnect: true,
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
    });
    publisher.on("error", () => {
      // Silently absorb connection errors to avoid crashing the server
    });
  }
  return publisher;
}

export interface SsePayload {
  type: string;
  data: unknown;
}

/**
 * Publishes a notification event to the Redis pub/sub channel for the given user.
 * Fire-and-forget: errors are swallowed silently.
 */
export function publishNotificationEvent(
  userId: string,
  payload: SsePayload
): void {
  const pub = getPublisher();
  if (!pub) return;

  const channel = `sse:notifications:${userId}`;
  pub.publish(channel, JSON.stringify(payload)).catch(() => {
    // Silently ignore publish errors
  });
}
