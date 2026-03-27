import { Redis } from "ioredis";

function getRedisUrl(): string {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL environment variable is not set");
  }
  return url;
}

/**
 * Creates a new ioredis connection suitable for BullMQ.
 * BullMQ requires separate connections for producers and consumers,
 * so we export a factory function rather than a singleton.
 */
export function createRedisConnection(): Redis {
  return new Redis(getRedisUrl(), {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,    // Required by BullMQ
  });
}

// Queue names as constants to avoid typos
export const QUEUE_NAMES = {
  PUBLISH: "postflow:publish",
  TOKEN_REFRESH: "postflow:token-refresh",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
