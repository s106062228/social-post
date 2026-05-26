import type { Platform } from "@prisma/client";

export const PLATFORM_CHAR_LIMITS: Record<Platform, number> = {
  FACEBOOK: 63206,
  INSTAGRAM: 2200,
  THREADS: 500,
  LINKEDIN: 3000,
  PINTEREST: 500,
  YOUTUBE: 5000,
  TIKTOK: 2200,
  TWITTER: 280,
  BLUESKY: 300,
  MASTODON: 500,
  TELEGRAM: 4096,
  REDDIT: 40000,
  NOSTR: 4096,
  TUMBLR: 4096,
  WORDPRESS: 200000,
  MEDIUM: 100000,
  GHOST: 100000,
  DEVTO: 100000,
  GOOGLE_BUSINESS: 1500,
  HASHNODE: 40000,
  BEEHIIV: 50000,
};

export interface CharacterInfo {
  count: number;
  limit: number;
  remaining: number;
  isOverLimit: boolean;
  percentage: number;
}

export function getCharacterInfo(content: string, platform: Platform): CharacterInfo {
  const count = content.length;
  const limit = PLATFORM_CHAR_LIMITS[platform];
  const remaining = limit - count;
  const percentage = Math.min((count / limit) * 100, 100);
  return { count, limit, remaining, isOverLimit: remaining < 0, percentage };
}

export function getStrictestLimit(platforms: Platform[]): number | null {
  if (platforms.length === 0) return null;
  return Math.min(...platforms.map((p) => PLATFORM_CHAR_LIMITS[p]));
}

export function isContentOverLimitForAny(content: string, platforms: Platform[]): boolean {
  return platforms.some((p) => getCharacterInfo(content, p).isOverLimit);
}
