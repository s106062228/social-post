import { NextResponse } from "next/server";
import { createRedisConnection } from "@/lib/queue/connection";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  limit: number;
  /** Sliding window duration in seconds */
  windowSeconds: number;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  limit: number;
  resetAt: Date;
}

// ── Core rate-limit logic (sliding window via Redis sorted set) ───────────────
//
// Each unique `key` gets a sorted set where member = "<timestamp>-<nonce>"
// and score = timestamp (ms). Entries older than `windowSeconds` are pruned
// on every call so the set stays small. The cardinality after pruning is the
// current request count within the window.

export async function checkRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const redis = createRedisConnection();
  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;
  const resetAt = new Date(now + windowMs);

  try {
    const pipeline = redis.pipeline();
    // Remove entries outside the current window
    pipeline.zremrangebyscore(key, 0, now - windowMs);
    // Record this request
    pipeline.zadd(key, now, `${now}-${Math.random().toString(36).slice(2)}`);
    // Count requests in the current window
    pipeline.zcard(key);
    // Expire the key slightly after the window so Redis cleans it up
    pipeline.expire(key, config.windowSeconds + 1);

    const results = await pipeline.exec();
    const count = (results?.[2]?.[1] as number | null) ?? 0;

    return {
      success: count <= config.limit,
      remaining: Math.max(0, config.limit - count),
      limit: config.limit,
      resetAt,
    };
  } finally {
    redis.disconnect();
  }
}

// ── Response helper ───────────────────────────────────────────────────────────

export function buildRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": result.resetAt.toISOString(),
  };
}

export function rateLimitExceededResponse(result: RateLimitResult): NextResponse {
  const retryAfterSeconds = Math.ceil((result.resetAt.getTime() - Date.now()) / 1000);
  return NextResponse.json(
    { error: "Too many requests", retryAfter: result.resetAt.toISOString() },
    {
      status: 429,
      headers: {
        ...buildRateLimitHeaders(result),
        "Retry-After": String(retryAfterSeconds),
      },
    }
  );
}

// ── Pre-configured limiters ───────────────────────────────────────────────────

export const RATE_LIMITS = {
  /** Publish endpoint — 20 publishes per minute per user */
  publish: { limit: 20, windowSeconds: 60 } satisfies RateLimitConfig,
  /** Post creation — 60 mutations per minute per user */
  postMutate: { limit: 60, windowSeconds: 60 } satisfies RateLimitConfig,
  /** Media upload — 30 presigned URLs per minute per user */
  mediaUpload: { limit: 30, windowSeconds: 60 } satisfies RateLimitConfig,
  /** Auth endpoints — 10 attempts per minute per IP */
  auth: { limit: 10, windowSeconds: 60 } satisfies RateLimitConfig,
} as const;
