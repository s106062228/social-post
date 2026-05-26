"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import type { ContentFatigueResponse } from "@/app/api/analytics/content-fatigue/route";
import type { PlatformFatigueData } from "@/lib/content-fatigue";

const PLATFORM_LABELS: Record<string, string> = {
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

function scoreColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-yellow-600";
  return "text-red-600";
}

function scoreBarColor(score: number): string {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-yellow-500";
  return "bg-red-500";
}

function TrendIcon({ trend }: { trend: PlatformFatigueData["trend"] }) {
  if (trend === "improving")
    return <TrendingUp className="h-4 w-4 text-green-500" />;
  if (trend === "declining")
    return <TrendingDown className="h-4 w-4 text-red-500" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

function trendLabel(trend: PlatformFatigueData["trend"]): string {
  if (trend === "improving") return "Improving";
  if (trend === "declining") return "Declining";
  return "Stable";
}

export function ContentFatigueCard() {
  const [data, setData] = useState<ContentFatigueResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/analytics/content-fatigue");
      if (res.ok) {
        const json = (await res.json()) as ContentFatigueResponse;
        setData(json);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-muted-foreground" />
            Content Fatigue Detection
          </CardTitle>
          <CardDescription>
            Compares recent 7-day engagement to prior 23-day baseline per
            platform
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchData}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : !data || data.platforms.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No data yet. Publish posts across platforms to track engagement
            trends.
          </p>
        ) : (
          <div className="space-y-4">
            {/* Overall health banner */}
            <div
              className={`flex items-center gap-3 rounded-lg border p-3 ${
                data.overallFatigued
                  ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950"
                  : "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950"
              }`}
            >
              {data.overallFatigued ? (
                <AlertTriangle className="h-5 w-5 text-red-500" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              )}
              <div>
                <p
                  className={`text-sm font-medium ${
                    data.overallFatigued ? "text-red-700 dark:text-red-300" : "text-green-700 dark:text-green-300"
                  }`}
                >
                  {data.overallFatigued
                    ? "Engagement fatigue detected on some platforms"
                    : "Engagement looks healthy across platforms"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Analyzed{" "}
                  {new Date(data.analyzedAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>

            {/* Per-platform breakdown */}
            <div className="space-y-3">
              {data.platforms.map((platform) => (
                <div key={platform.platform} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {PLATFORM_LABELS[platform.platform] ?? platform.platform}
                      </span>
                      {platform.isFatigued && (
                        <Badge variant="destructive" className="text-xs">
                          Fatigued
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <TrendIcon trend={platform.trend} />
                      <span className="text-xs text-muted-foreground">
                        {trendLabel(platform.trend)}
                      </span>
                      <span
                        className={`text-sm font-bold ${scoreColor(platform.fatigueScore)}`}
                      >
                        {platform.fatigueScore}
                      </span>
                    </div>
                  </div>

                  {/* Score bar */}
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all ${scoreBarColor(platform.fatigueScore)}`}
                      style={{ width: `${platform.fatigueScore}%` }}
                    />
                  </div>

                  {/* Stats row */}
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>
                      Recent avg:{" "}
                      <span className="font-medium text-foreground">
                        {platform.recentAvgEngagement.toLocaleString()}
                      </span>{" "}
                      ({platform.recentPostCount} posts)
                    </span>
                    <span>
                      Baseline:{" "}
                      <span className="font-medium text-foreground">
                        {platform.baselineAvgEngagement.toLocaleString()}
                      </span>{" "}
                      ({platform.baselinePostCount} posts)
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              Score ≤70 indicates fatigue. Refresh content strategy, try new
              formats, or increase posting frequency to re-engage your audience.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
