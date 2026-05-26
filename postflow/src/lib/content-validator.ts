import type { MediaType, Platform } from "@prisma/client";
import { PLATFORM_CHAR_LIMITS } from "./character-limits";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface PlatformValidationResult extends ValidationResult {
  platform: Platform;
}

// Per-platform media type support
const PLATFORM_MEDIA_SUPPORT: Record<Platform, MediaType[]> = {
  FACEBOOK: ["NONE", "IMAGE", "VIDEO", "CAROUSEL"],
  INSTAGRAM: ["IMAGE", "VIDEO", "CAROUSEL"],
  THREADS: ["NONE", "IMAGE", "VIDEO", "CAROUSEL"],
  LINKEDIN: ["NONE", "IMAGE"],
  PINTEREST: ["IMAGE"],
  YOUTUBE: ["VIDEO"],
  TIKTOK: ["VIDEO"],
  TWITTER: ["NONE", "IMAGE"],
  BLUESKY: ["NONE", "IMAGE"],
  MASTODON: ["NONE", "IMAGE"],
  TELEGRAM: ["NONE", "IMAGE", "CAROUSEL"],
  REDDIT: ["NONE", "IMAGE"],
  NOSTR: ["NONE", "IMAGE"],
  TUMBLR: ["NONE", "IMAGE"],
  WORDPRESS: ["NONE", "IMAGE"],
  MEDIUM: ["NONE", "IMAGE"],
  GHOST: ["NONE", "IMAGE"],
  DEVTO: ["NONE", "IMAGE"],
  GOOGLE_BUSINESS: ["NONE", "IMAGE"],
  HASHNODE: ["NONE", "IMAGE"],
  BEEHIIV: ["NONE", "IMAGE"],
};

// Per-platform URL limits (max URLs in content, null = no limit)
const PLATFORM_URL_LIMITS: Partial<Record<Platform, number>> = {
  TWITTER: 1,
  THREADS: 1,
  BLUESKY: 1,
};

// Per-platform hashtag limits (null = no enforced limit)
const PLATFORM_HASHTAG_LIMITS: Partial<Record<Platform, number>> = {
  INSTAGRAM: 30,
  TWITTER: 30,
  THREADS: 10,
  LINKEDIN: 30,
  TIKTOK: 30,
};

// Platforms that require media (cannot post text-only)
const MEDIA_REQUIRED_PLATFORMS: Platform[] = ["PINTEREST", "YOUTUBE", "TIKTOK"];

function countUrls(content: string): number {
  const urlPattern = /https?:\/\/[^\s]+/gi;
  const matches = content.match(urlPattern);
  return matches ? matches.length : 0;
}

function countHashtags(content: string): number {
  const hashtagPattern = /#[a-zA-Z0-9_]+/g;
  const matches = content.match(hashtagPattern);
  return matches ? matches.length : 0;
}

export function validateForPlatform(
  content: string,
  mediaType: MediaType,
  platform: Platform
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Character limit check
  const limit = PLATFORM_CHAR_LIMITS[platform];
  if (content.length > limit) {
    errors.push(
      `Content exceeds ${platform} character limit (${content.length}/${limit})`
    );
  } else if (content.length > limit * 0.9) {
    warnings.push(
      `Content is near ${platform} character limit (${content.length}/${limit})`
    );
  }

  // Media type support check
  const supportedMedia = PLATFORM_MEDIA_SUPPORT[platform];
  if (!supportedMedia.includes(mediaType)) {
    errors.push(
      `${platform} does not support ${mediaType} posts`
    );
  }

  // Media required check
  if (MEDIA_REQUIRED_PLATFORMS.includes(platform) && mediaType === "NONE") {
    errors.push(`${platform} requires media (image or video) — text-only posts are not supported`);
  }

  // URL count check
  const urlLimit = PLATFORM_URL_LIMITS[platform];
  if (urlLimit !== undefined) {
    const urlCount = countUrls(content);
    if (urlCount > urlLimit) {
      warnings.push(
        `${platform} recommends at most ${urlLimit} URL(s) per post (found ${urlCount})`
      );
    }
  }

  // Hashtag count check
  const hashtagLimit = PLATFORM_HASHTAG_LIMITS[platform];
  if (hashtagLimit !== undefined) {
    const hashtagCount = countHashtags(content);
    if (hashtagCount > hashtagLimit) {
      warnings.push(
        `${platform} allows at most ${hashtagLimit} hashtags (found ${hashtagCount})`
      );
    }
  }

  // Empty content check (for platforms that support text posts)
  if (content.trim().length === 0 && mediaType === "NONE") {
    errors.push(`Content cannot be empty for a text post on ${platform}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateForAllPlatforms(
  content: string,
  mediaType: MediaType,
  platforms: Platform[]
): PlatformValidationResult[] {
  return platforms.map((platform) => ({
    platform,
    ...validateForPlatform(content, mediaType, platform),
  }));
}
