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
import { Gauge, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type {
  PostingFrequencyResponse,
  PlatformFrequencyData,
} from "@/app/api/analytics/posting-frequency/route";

type Period = "7d" | "30d" | "90d";

const PERIOD_LABELS: Record<Period, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
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
  BEEHIIV: "Beehiiv",
  PIXELFED: "Pixelfed",
  VIMEO: "Vimeo",
};

function pacingScoreColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-yellow-600";
  return "text-red-600";
}

function pacingBarColor(score: number): string {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-yellow-500";
  return "bg-red-500";
}

function StatusChip({ status }: { status: PlatformFrequencyData["status"] }) {
  if (status === "optimal") {
    return (
      <Badge variant="outline" className="border-green-300 text-green-700 text-[10px] px-1.5 py-0">
        <Minus className="h-2.5 w-2.5 mr-0.5" />
        Optimal
      </Badge>
    );
  }
  if (status === "over") {
    return (
      <Badge variant="outline" className="border-amber-300 text-amber-700 text-[10px] px-1.5 py-0">
        <TrendingUp className="h-2.5 w-2.5 mr-0.5" />
        Over-posting
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-blue-300 text-blue-700 text-[10px] px-1.5 py-0">
      <TrendingDown className="h-2.5 w-2.5 mr-0.5" />
      Under-posting
    </Badge>
  );
}

function PlatformRow({ p }: { p: PlatformFrequencyData }) {
  const label = PLATFORM_LABELS[p.platform] ?? p.platform;
  const actualPct = Math.min(100, (p.actualPerWeek / (p.recommendedPerWeek * 1.5)) * 100);
  const recommendedPct = (p.recommendedPerWeek / (p.recommendedPerWeek * 1.5)) * 100;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <div className="flex items-center gap-2">
          <StatusChip status={p.status} />
          <span className={`font-semibold ${pacingScoreColor(p.pacingScore)}`}>
            {p.pacingScore}/100
          </span>
        </div>
      </div>

      {/* Dual progress bar: actual vs recommended */}
      <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden">
        {/* Recommended marker */}
        <div
          className="absolute top-0 h-full w-0.5 bg-slate-400 z-10"
          style={{ left: `${recommendedPct}%` }}
          title={`Target: ${p.recommendedPerWeek}/wk`}
        />
        {/* Actual bar */}
        <div
          className={`h-full rounded-full transition-all ${pacingBarColor(p.pacingScore)}`}
          style={{ width: `${actualPct}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">{p.actualPerWeek}</span>/wk actual
          {" · "}
          <span className="font-medium text-foreground">{p.recommendedPerWeek}</span>/wk target
        </span>
        <span>{p.totalPublished} total</span>
      </div>
    </div>
  );
}

function ScoreCircle({ score }: { score: number }) {
  const color = score >= 80 ? "#22c55e" : score >= 60 ? "#eab308" : "#ef4444";
  const circumference = 2 * Math.PI * 30;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="80" height="80" className="-rotate-90">
        <circle cx="40" cy="40" r="30" fill="none" stroke="currentColor" strokeWidth="6" className="text-muted" />
        <circle
          cx="40"
          cy="40"
          r="30"
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      <span className={`absolute text-xl font-bold ${pacingScoreColor(score)}`}>
        {score}
      </span>
    </div>
  );
}

export function PostingFrequencyCard() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<PostingFrequencyResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (p: Period) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics/posting-frequency?period=${p}`);
      if (res.ok) {
        const json = (await res.json()) as PostingFrequencyResponse;
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
            <Gauge className="h-5 w-5 text-indigo-500" />
            <CardTitle className="text-base">Posting Frequency & Pacing</CardTitle>
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
          Actual vs recommended posting frequency per platform
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-0">
        {loading ? (
          <div className="space-y-4 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-4 bg-muted rounded w-1/3" />
                <div className="h-2 bg-muted rounded" />
                <div className="h-3 bg-muted rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : !data || data.platforms.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <Gauge className="h-10 w-10 mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No published posts for this period yet.
            </p>
            <p className="text-xs text-muted-foreground">
              Publish posts to see your pacing analysis.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Overall pacing score summary */}
            <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
              <ScoreCircle score={data.overallPacingScore} />
              <div className="flex-1 space-y-1">
                <p className="text-sm font-medium">Overall Pacing Score</p>
                <p className="text-xs text-muted-foreground">
                  {data.overallPacingScore >= 80
                    ? "Great pacing — you are posting consistently across platforms."
                    : data.overallPacingScore >= 60
                    ? "Pacing could be improved — some platforms are over or under-represented."
                    : "Pacing needs attention — significant imbalance detected across platforms."}
                </p>
                <p className="text-xs text-muted-foreground">
                  {data.totalPublished} posts published in last {PERIOD_LABELS[period]}
                </p>
              </div>
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
