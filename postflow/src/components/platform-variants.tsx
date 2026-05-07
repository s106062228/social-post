"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Platform } from "@prisma/client";

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
};

const PLATFORM_LIMITS: Record<Platform, number> = {
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
};

export interface PlatformVariantData {
  platform: Platform;
  content: string;
  enabled: boolean;
}

interface PlatformVariantsProps {
  platforms: Platform[];
  baseContent: string;
  variants: PlatformVariantData[];
  onChange: (variants: PlatformVariantData[]) => void;
}

export function PlatformVariants({
  platforms,
  baseContent,
  variants,
  onChange,
}: PlatformVariantsProps) {
  const [activeTab, setActiveTab] = useState<Platform | null>(
    platforms[0] ?? null
  );

  if (platforms.length < 2) return null;

  function getVariant(platform: Platform): PlatformVariantData {
    return (
      variants.find((v) => v.platform === platform) ?? {
        platform,
        content: baseContent,
        enabled: false,
      }
    );
  }

  function updateVariant(platform: Platform, patch: Partial<PlatformVariantData>) {
    const existing = getVariant(platform);
    const updated = { ...existing, ...patch };
    const next = [
      ...variants.filter((v) => v.platform !== platform),
      updated,
    ];
    onChange(next);
  }

  const active = activeTab ?? platforms[0];

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed border-muted-foreground/30 p-4">
      <p className="text-sm font-medium text-foreground">
        Per-platform content variants
      </p>
      <p className="text-xs text-muted-foreground">
        Enable a variant to override the main post content for a specific platform.
      </p>

      {/* Platform tabs */}
      <div className="flex gap-1 rounded-md bg-muted p-1">
        {platforms.map((platform) => {
          const variant = getVariant(platform);
          return (
            <button
              key={platform}
              type="button"
              onClick={() => setActiveTab(platform)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                active === platform
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {PLATFORM_LABELS[platform]}
              {variant.enabled && (
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>

      {/* Active tab content */}
      {platforms.map((platform) => {
        if (platform !== active) return null;
        const variant = getVariant(platform);
        const limit = PLATFORM_LIMITS[platform];
        const chars = variant.enabled ? variant.content.length : baseContent.length;
        const overLimit = chars > limit;

        return (
          <div key={platform} className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id={`variant-toggle-${platform}`}
                checked={variant.enabled}
                onChange={(e) => {
                  updateVariant(platform, {
                    enabled: e.target.checked,
                    content: e.target.checked ? baseContent : variant.content,
                  });
                }}
                className="h-4 w-4 cursor-pointer accent-primary"
              />
              <Label htmlFor={`variant-toggle-${platform}`} className="text-sm cursor-pointer">
                Custom content for {PLATFORM_LABELS[platform]}
              </Label>
            </div>

            {variant.enabled && (
              <div className="flex flex-col gap-1">
                <Textarea
                  value={variant.content}
                  onChange={(e) =>
                    updateVariant(platform, { content: e.target.value })
                  }
                  placeholder={`Content for ${PLATFORM_LABELS[platform]}…`}
                  className="min-h-[120px] resize-none"
                />
                <div
                  className={`text-right text-xs ${
                    overLimit
                      ? "text-destructive"
                      : chars / limit >= 0.9
                      ? "text-yellow-600"
                      : "text-muted-foreground"
                  }`}
                >
                  {chars.toLocaleString()} / {limit.toLocaleString()}
                  {overLimit && " — over limit"}
                </div>
              </div>
            )}

            {!variant.enabled && (
              <p className="text-xs text-muted-foreground italic">
                Using main post content ({baseContent.length.toLocaleString()} chars)
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
