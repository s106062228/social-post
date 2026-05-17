"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HeartPulse, RefreshCw, Wifi, WifiOff } from "lucide-react";
import type {
  AccountHealthResponse,
  AccountHealthEntry,
} from "@/app/api/analytics/account-health/route";

// ── Platform labels ───────────────────────────────────────────────────────────

const PLATFORM_LABELS: Record<string, string> = {
  FACEBOOK: "FB",
  INSTAGRAM: "IG",
  THREADS: "TH",
  LINKEDIN: "LI",
  PINTEREST: "PI",
  YOUTUBE: "YT",
  TIKTOK: "TK",
  TWITTER: "X",
  BLUESKY: "BS",
  MASTODON: "MD",
  TELEGRAM: "TG",
  REDDIT: "RD",
  NOSTR: "NS",
  TUMBLR: "TU",
  WORDPRESS: "WP",
  MEDIUM: "ME",
  GHOST: "GH",
  DEVTO: "DV",
  HASHNODE: "HN",
};

const PLATFORM_COLOURS: Record<string, string> = {
  FACEBOOK: "bg-blue-600 text-white",
  INSTAGRAM: "bg-pink-600 text-white",
  THREADS: "bg-zinc-800 text-white",
  LINKEDIN: "bg-blue-700 text-white",
  PINTEREST: "bg-red-600 text-white",
  YOUTUBE: "bg-red-600 text-white",
  TIKTOK: "bg-black text-white",
  TWITTER: "bg-sky-500 text-white",
  BLUESKY: "bg-sky-600 text-white",
  MASTODON: "bg-violet-700 text-white",
  TELEGRAM: "bg-cyan-500 text-white",
  REDDIT: "bg-orange-600 text-white",
  NOSTR: "bg-purple-700 text-white",
  TUMBLR: "bg-indigo-700 text-white",
  WORDPRESS: "bg-blue-800 text-white",
  MEDIUM: "bg-green-700 text-white",
  GHOST: "bg-yellow-700 text-white",
  DEVTO: "bg-gray-900 text-white",
  HASHNODE: "bg-blue-500 text-white",
};

// ── Score circle ──────────────────────────────────────────────────────────────

function ScoreCircle({ score, label }: { score: number; label: string }) {
  const colour =
    score >= 70
      ? "text-emerald-600 dark:text-emerald-400"
      : score >= 40
      ? "text-amber-500 dark:text-amber-400"
      : "text-red-500 dark:text-red-400";

  const ring =
    score >= 70
      ? "ring-emerald-200 dark:ring-emerald-900"
      : score >= 40
      ? "ring-amber-200 dark:ring-amber-900"
      : "ring-red-200 dark:ring-red-900";

  return (
    <div
      className={`flex h-16 w-16 flex-col items-center justify-center rounded-full ring-4 ${ring}`}
    >
      <span className={`text-xl font-bold ${colour}`}>{score}</span>
      <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
        /100
      </span>
    </div>
  );
}

// ── Single account card ───────────────────────────────────────────────────────

function AccountCard({ entry }: { entry: AccountHealthEntry }) {
  const labelVariant =
    entry.healthLabel === "Healthy"
      ? "default"
      : entry.healthLabel === "Fair"
      ? "secondary"
      : "destructive";

  const platformLabel = PLATFORM_LABELS[entry.platform] ?? entry.platform.slice(0, 2);
  const platformColour = PLATFORM_COLOURS[entry.platform] ?? "bg-gray-600 text-white";

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-5 shadow-sm">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-md text-xs font-bold ${platformColour}`}
          >
            {platformLabel}
          </span>
          <div>
            <p className="font-medium leading-tight">{entry.accountName}</p>
            <p className="text-xs text-muted-foreground capitalize">
              {entry.platform.toLowerCase()}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <ScoreCircle score={entry.healthScore} label={entry.healthLabel} />
          <Badge variant={labelVariant} className="text-[10px]">
            {entry.healthLabel}
          </Badge>
        </div>
      </div>

      {/* Status indicator */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {entry.isActive ? (
          <>
            <Wifi className="h-3 w-3 text-emerald-500" />
            <span>Connected</span>
          </>
        ) : (
          <>
            <WifiOff className="h-3 w-3 text-red-500" />
            <span>Disconnected</span>
          </>
        )}
      </div>

      {/* Metrics chips */}
      <div className="grid grid-cols-2 gap-2">
        <MetricChip
          label="Posts (30d)"
          value={String(entry.metrics.postsPublished30d)}
        />
        <MetricChip
          label="Avg Engagement"
          value={`${entry.metrics.avgEngagementRate.toFixed(1)}%`}
        />
        <MetricChip
          label="Follower Growth"
          value={
            entry.metrics.followerGrowth30d !== null
              ? entry.metrics.followerGrowth30d >= 0
                ? `+${entry.metrics.followerGrowth30d}`
                : String(entry.metrics.followerGrowth30d)
              : "N/A"
          }
          positive={
            entry.metrics.followerGrowth30d !== null
              ? entry.metrics.followerGrowth30d >= 0
              : undefined
          }
        />
        <MetricChip
          label="Last Post"
          value={
            entry.metrics.daysSinceLastPost !== null
              ? entry.metrics.daysSinceLastPost === 0
                ? "Today"
                : `${entry.metrics.daysSinceLastPost}d ago`
              : "Never"
          }
        />
      </div>
    </div>
  );
}

function MetricChip({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  const valueColour =
    positive === true
      ? "text-emerald-600 dark:text-emerald-400"
      : positive === false
      ? "text-red-500 dark:text-red-400"
      : "";

  return (
    <div className="rounded-md bg-muted/50 px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={`text-sm font-semibold ${valueColour}`}>{value}</p>
    </div>
  );
}

// ── AccountHealthCard (exported) ──────────────────────────────────────────────

export function AccountHealthCard() {
  const [data, setData] = useState<AccountHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analytics/account-health");
      if (!res.ok) throw new Error("Failed to load account health data");
      const json = (await res.json()) as AccountHealthResponse;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const avgScore =
    data && data.accounts.length > 0
      ? Math.round(
          data.accounts.reduce((s, a) => s + a.healthScore, 0) /
            data.accounts.length
        )
      : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HeartPulse className="h-5 w-5 text-indigo-500" />
            <div>
              <CardTitle className="text-base">Account Health</CardTitle>
              <CardDescription className="text-xs">
                30-day activity, engagement, and growth per connected account
              </CardDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void fetchData()}
            disabled={loading}
            aria-label="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Fleet-wide average banner */}
        {avgScore !== null && (
          <div className="mt-2 flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
            <span className="text-muted-foreground">Fleet average score:</span>
            <span
              className={`font-bold ${
                avgScore >= 70
                  ? "text-emerald-600 dark:text-emerald-400"
                  : avgScore >= 40
                  ? "text-amber-500"
                  : "text-red-500"
              }`}
            >
              {avgScore} / 100
            </span>
          </div>
        )}
      </CardHeader>

      <CardContent>
        {loading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-48 animate-pulse rounded-lg bg-muted"
              />
            ))}
          </div>
        )}

        {!loading && error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {!loading && !error && data?.accounts.length === 0 && (
          <div className="py-10 text-center text-muted-foreground">
            <HeartPulse className="mx-auto mb-2 h-8 w-8 opacity-30" />
            <p className="text-sm">No connected accounts found.</p>
            <p className="text-xs">
              Connect a social account to see health metrics.
            </p>
          </div>
        )}

        {!loading && !error && data && data.accounts.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.accounts.map((entry) => (
              <AccountCard key={entry.accountId} entry={entry} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
