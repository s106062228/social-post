import { Redis } from "ioredis";

export interface RateLimitConfig {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
}

// Singleton Redis client (separate from BullMQ connections)
let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_URL not set");
    redis = new Redis(url, { lazyConnect: true, enableReadyCheck: false });
  }
  return redis;
}

/**
 * Sliding window rate limiter backed by Redis sorted sets.
 * Each request is stored as a timestamped entry; old entries are pruned on each call.
 */
export async function rateLimit(
  identifier: string,
  { limit, windowMs }: RateLimitConfig
): Promise<RateLimitResult> {
  const client = getRedis();
  const key = `rl:${identifier}`;
  const now = Date.now();
  const windowStart = now - windowMs;
  const member = `${now}:${Math.random().toString(36).slice(2)}`;

  const pipe = client.pipeline();
  pipe.zremrangebyscore(key, 0, windowStart);
  pipe.zadd(key, now, member);
  pipe.zcard(key);
  pipe.pexpire(key, windowMs);
  const results = await pipe.exec();

  const count = (results?.[2]?.[1] as number) ?? 0;
  const remaining = Math.max(0, limit - count);
  const resetAt = new Date(now + windowMs);

  return { success: count <= limit, limit, remaining, resetAt };
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": result.limit.toString(),
    "X-RateLimit-Remaining": result.remaining.toString(),
    "X-RateLimit-Reset": result.resetAt.toISOString(),
  };
}

// Pre-configured limiters

/** General API: 100 requests per minute per user */
export const apiLimiter = (id: string) =>
  rateLimit(`api:${id}`, { limit: 100, windowMs: 60_000 });

/** Publish endpoint: 20 requests per minute per user */
export const publishLimiter = (id: string) =>
  rateLimit(`publish:${id}`, { limit: 20, windowMs: 60_000 });

/** OAuth connect: 10 attempts per minute per IP */
export const oauthLimiter = (ip: string) =>
  rateLimit(`oauth:${ip}`, { limit: 10, windowMs: 60_000 });

/** Auth/register: 5 attempts per minute per IP */
export const authLimiter = (ip: string) =>
  rateLimit(`auth:${ip}`, { limit: 5, windowMs: 60_000 });
