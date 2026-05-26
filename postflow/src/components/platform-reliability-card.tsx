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
import { Activity, CheckCircle2, XCircle, AlertCircle, Clock } from "lucide-react";
import type {
  PublishReliabilityResponse,
  PlatformReliabilityData,
} from "@/app/api/analytics/publish-reliability/route";

type Period = "7d" | "30d" | "90d" | "all";

const PERIOD_LABELS: Record<Period, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  all: "All time",
};

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

function successRateColor(rate: number): string {
  if (rate >= 90) return "text-green-600";
  if (rate >= 70) return "text-yellow-600";
  return "text-red-600";
}

function successRateBarColor(rate: number): string {
  if (rate >= 90) return "bg-green-500";
  if (rate >= 70) return "bg-yellow-500";
  return "bg-red-500";
}

function formatLatency(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${Math.round(ms / 3_600_000)}h`;
}

function PlatformRow({ p }: { p: PlatformReliabilityData }) {
  const [expanded, setExpanded] = useState(false);
  const label = PLATFORM_LABELS[p.platform] ?? p.platform;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <div className="flex items-center gap-3">
          {p.avgPublishLatencyMs !== null && (
            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
              <Clock className="h-3 w-3" />
              {formatLatency(p.avgPublishLatencyMs)} avg
            </span>
          )}
          {p.avgRetryCount > 0 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {p.avgRetryCount} retries/job
            </Badge>
          )}
          <span className={`font-semibold ${successRateColor(p.successRate)}`}>
            {p.successRate}%
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${successRateBarColor(p.successRate)}`}
          style={{ width: `${p.successRate}%` }}
        />
      </div>

      {/* Counts */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3 text-green-500" />
          {p.successCount} published
        </span>
        {p.failedCount > 0 && (
          <span className="flex items-center gap-1">
            <XCircle className="h-3 w-3 text-red-500" />
            {p.failedCount} failed
          </span>
        )}
        {p.commonErrors.length > 0 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs underline underline-offset-2 hover:text-foreground transition-colors ml-auto"
          >
            {expanded ? "Hide errors" : "View errors"}
          </button>
        )}
      </div>

      {expanded && p.commonErrors.length > 0 && (
        <div className="rounded-md border border-destructive/20 bg-destructive/5 p-2 space-y-1">
          {p.commonErrors.map((err, i) => (
            <p key={i} className="text-xs text-destructive/80 truncate">
              {err}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export function PlatformReliabilityCard() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<PublishReliabilityResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (p: Period) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics/publish-reliability?period=${p}`);
      if (res.ok) {
        const json = (await res.json()) as PublishReliabilityResponse;
        setData(json);
      }
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(period);
  }, [fetchData, period]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-500" />
            <CardTitle className="text-base">Platform Publishing Reliability</CardTitle>
          </div>
          <div className="flex gap-1">
            {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
              <Button
                key={p}
                variant={period === p ? "default" : "ghost"}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setPeriod(p)}
              >
                {PERIOD_LABELS[p]}
              </Button>
            ))}
          </div>
        </div>
        <CardDescription>
          Success rates, retry counts, and common errors per platform
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-0">
        {loading ? (
          <div className="space-y-4 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-4 bg-muted rounded w-1/3" />
                <div className="h-2 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : !data || data.platforms.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <Activity className="h-10 w-10 mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No publishing data for this period yet.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Overall summary */}
            <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
              <div className="text-center">
                <p
                  className={`text-3xl font-bold ${successRateColor(data.overallSuccessRate)}`}
                >
                  {data.overallSuccessRate}%
                </p>
                <p className="text-xs text-muted-foreground">overall</p>
              </div>
              <div className="flex-1 grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  <span>
                    <span className="font-medium">{data.totalPublished}</span>
                    <span className="text-muted-foreground"> published</span>
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                  <span>
                    <span className="font-medium">{data.totalFailed}</span>
                    <span className="text-muted-foreground"> failed</span>
                  </span>
                </div>
              </div>
              {data.totalFailed > 0 && data.overallSuccessRate < 90 && (
                <AlertCircle className="h-5 w-5 text-yellow-500 shrink-0" />
              )}
            </div>

            {/* Per-platform breakdown */}
            <div className="space-y-4 divide-y divide-border">
              {data.platforms.map((p, i) => (
                <div key={p.platform} className={i > 0 ? "pt-4" : ""}>
                  <PlatformRow p={p} />
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
