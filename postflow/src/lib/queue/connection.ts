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
  TOKEN_EXPIRY_CHECK: "postflow:token-expiry-check",
  RECURRING_SCHEDULE: "postflow:recurring-schedule",
  SYNC_INSIGHTS: "postflow:sync-insights",
  SYNC_INSIGHTS_SCAN: "postflow:sync-insights-scan",
  RSS_IMPORT: "postflow:rss-import",
  REPORT: "postflow:report",
  REMINDER: "postflow:reminder",
  PERFORMANCE_ALERT_SCAN: "postflow:performance-alert-scan",
  POST_EXPIRY: "postflow:post-expiry",
  NOTIFICATION_DIGEST: "postflow:notification-digest",
  AUDIENCE_SYNC: "postflow:audience-sync",
  EVERGREEN_RECYCLE: "postflow:evergreen-recycle",
  COACHING_SCAN: "postflow:coaching-scan",
  ENGAGEMENT_GOAL_SCAN: "postflow:engagement-goal-scan",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
