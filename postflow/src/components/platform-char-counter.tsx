"use client";

import type { Platform } from "@prisma/client";
import { getCharacterInfo } from "@/lib/character-limits";

const PLATFORM_LABELS: Record<Platform, string> = {
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  THREADS: "Threads",
  LINKEDIN: "LinkedIn",
  PINTEREST: "Pinterest",
  YOUTUBE: "YouTube",
  TIKTOK: "TikTok",
  TWITTER: "X (Twitter)",
  BLUESKY: "Bluesky",
  MASTODON: "Mastodon",
  TELEGRAM: "Telegram",
  REDDIT: "Reddit",
  NOSTR: "Nostr",
  TUMBLR: "Tumblr",
  WORDPRESS: "WordPress",
  MEDIUM: "Medium",
  GHOST: "Ghost",
  DEVTO: "Dev.to",
  GOOGLE_BUSINESS: "Google Business",
  HASHNODE: "Hashnode",
};

interface PlatformCharCounterProps {
  content: string;
  platforms: Platform[];
}

export function PlatformCharCounter({ content, platforms }: PlatformCharCounterProps) {
  if (platforms.length === 0) return null;

  const uniquePlatforms = [...new Set(platforms)] as Platform[];

  return (
    <div className="flex flex-wrap gap-3">
      {uniquePlatforms.map((platform) => {
        const info = getCharacterInfo(content, platform);
        const colorClass = info.isOverLimit
          ? "text-destructive font-semibold"
          : info.percentage >= 90
          ? "text-yellow-600"
          : "text-muted-foreground";

        return (
          <span key={platform} className="flex items-center gap-1 text-xs">
            <span className="text-muted-foreground">{PLATFORM_LABELS[platform]}:</span>
            <span className={colorClass}>
              {info.count}/{info.limit}
            </span>
            {info.isOverLimit && (
              <span className="text-destructive">
                ({Math.abs(info.remaining)} over)
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
