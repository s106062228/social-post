"use client";

import { useEffect, useState } from "react";
import type { MediaType, Platform } from "@prisma/client";
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { validateForAllPlatforms, type PlatformValidationResult } from "@/lib/content-validator";

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
  BEEHIIV: "Beehiiv",
  PIXELFED: "Pixelfed",
};

interface ValidationPanelProps {
  content: string;
  mediaType: MediaType;
  platforms: Platform[];
}

export function ValidationPanel({ content, mediaType, platforms }: ValidationPanelProps) {
  const [results, setResults] = useState<PlatformValidationResult[]>([]);
  const [expanded, setExpanded] = useState<Set<Platform>>(new Set());

  useEffect(() => {
    if (platforms.length === 0) {
      setResults([]);
      return;
    }
    setResults(validateForAllPlatforms(content, mediaType, platforms));
  }, [content, mediaType, platforms]);

  if (platforms.length === 0 || results.length === 0) return null;

  const hasErrors = results.some((r) => !r.valid);
  const hasWarnings = results.some((r) => r.warnings.length > 0);

  function toggleExpanded(platform: Platform) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) {
        next.delete(platform);
      } else {
        next.add(platform);
      }
      return next;
    });
  }

  return (
    <div className="rounded-md border bg-card p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        {hasErrors ? (
          <AlertCircle className="h-4 w-4 text-destructive" />
        ) : hasWarnings ? (
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        )}
        <span>
          {hasErrors
            ? "Content has validation errors"
            : hasWarnings
            ? "Content has warnings"
            : "Content is valid for all selected platforms"}
        </span>
      </div>

      <div className="space-y-1">
        {results.map((result) => {
          const isExpanded = expanded.has(result.platform);
          const hasIssues = result.errors.length > 0 || result.warnings.length > 0;

          return (
            <div key={result.platform} className="text-xs">
              <button
                type="button"
                onClick={() => hasIssues && toggleExpanded(result.platform)}
                className={`flex items-center gap-1.5 w-full text-left py-0.5 ${hasIssues ? "cursor-pointer hover:text-foreground" : "cursor-default"}`}
              >
                {result.valid ? (
                  <CheckCircle2 className="h-3 w-3 text-green-500 flex-shrink-0" />
                ) : (
                  <AlertCircle className="h-3 w-3 text-destructive flex-shrink-0" />
                )}
                {result.warnings.length > 0 && result.valid && (
                  <AlertTriangle className="h-3 w-3 text-yellow-500 flex-shrink-0" />
                )}
                <span
                  className={
                    !result.valid
                      ? "text-destructive"
                      : result.warnings.length > 0
                      ? "text-yellow-600"
                      : "text-muted-foreground"
                  }
                >
                  {PLATFORM_LABELS[result.platform]}
                </span>
                {result.errors.length > 0 && (
                  <span className="text-destructive">
                    ({result.errors.length} error{result.errors.length > 1 ? "s" : ""})
                  </span>
                )}
                {result.warnings.length > 0 && (
                  <span className="text-yellow-600">
                    ({result.warnings.length} warning{result.warnings.length > 1 ? "s" : ""})
                  </span>
                )}
                {hasIssues && (
                  <span className="ml-auto text-muted-foreground">
                    {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </span>
                )}
              </button>

              {isExpanded && hasIssues && (
                <ul className="ml-5 mt-1 space-y-0.5 text-muted-foreground">
                  {result.errors.map((e, i) => (
                    <li key={`e-${i}`} className="text-destructive">
                      • {e}
                    </li>
                  ))}
                  {result.warnings.map((w, i) => (
                    <li key={`w-${i}`} className="text-yellow-600">
                      • {w}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
