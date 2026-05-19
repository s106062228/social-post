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
import { TrendingUp, TrendingDown, Minus, BarChart3, Info } from "lucide-react";
import type { BenchmarksResponse } from "@/app/api/analytics/benchmarks/route";
import type { BenchmarkComparison, PerformanceLabel } from "@/lib/engagement-benchmarks";

type Period = "30d" | "90d" | "180d" | "all";

const PERIOD_LABELS: Record<Period, string> = {
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "180d": "Last 180 days",
  all: "All time",
};

function performanceConfig(p: PerformanceLabel): {
  label: string;
  colour: string;
  bg: string;
  icon: React.ReactNode;
} {
  switch (p) {
    case "above":
      return {
        label: "Above average",
        colour: "text-green-700 dark:text-green-400",
        bg: "bg-green-50 dark:bg-green-950",
        icon: <TrendingUp className="h-3.5 w-3.5" />,
      };
    case "at":
      return {
        label: "At average",
        colour: "text-blue-700 dark:text-blue-400",
        bg: "bg-blue-50 dark:bg-blue-950",
        icon: <Minus className="h-3.5 w-3.5" />,
      };
    case "below":
      return {
        label: "Below average",
        colour: "text-red-700 dark:text-red-400",
        bg: "bg-red-50 dark:bg-red-950",
        icon: <TrendingDown className="h-3.5 w-3.5" />,
      };
    default:
      return {
        label: "Insufficient data",
        colour: "text-muted-foreground",
        bg: "bg-muted",
        icon: <Info className="h-3.5 w-3.5" />,
      };
  }
}

function fmt(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}

function PlatformRow({ c }: { c: BenchmarkComparison }) {
  const cfg = performanceConfig(c.performance);

  return (
    <div className={`rounded-lg p-3 ${cfg.bg} flex flex-col gap-2`}>
      {/* Header row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs">
            {c.platform}
          </Badge>
          <span className={`flex items-center gap-1 text-xs font-medium ${cfg.colour}`}>
            {cfg.icon}
            {cfg.label}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          {c.userMetrics.postCount} post{c.userMetrics.postCount !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Engagement rates */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div className="flex flex-col">
          <span className="text-muted-foreground">Your rate</span>
          <span className="font-semibold tabular-nums">
            {fmt(c.userMetrics.avgEngagementRate)}%
          </span>
        </div>
        {c.benchmark ? (
          <div className="flex flex-col">
            <span className="text-muted-foreground">Industry avg</span>
            <span className="font-semibold tabular-nums">
              {fmt(c.benchmark.engagementRate)}%
            </span>
          </div>
        ) : (
          <div className="flex flex-col">
            <span className="text-muted-foreground">Industry avg</span>
            <span className="text-muted-foreground text-xs">N/A</span>
          </div>
        )}
        <div className="flex flex-col">
          <span className="text-muted-foreground">Diff</span>
          <span
            className={`font-semibold tabular-nums ${
              c.diffPct === null
                ? "text-muted-foreground"
                : c.diffPct > 0
                ? "text-green-600 dark:text-green-400"
                : c.diffPct < 0
                ? "text-red-600 dark:text-red-400"
                : ""
            }`}
          >
            {c.diffPct === null
              ? "—"
              : `${c.diffPct > 0 ? "+" : ""}${fmt(c.diffPct, 0)}%`}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-muted-foreground">Total reach</span>
          <span className="font-semibold tabular-nums">
            {c.userMetrics.reach.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Source */}
      {c.benchmark && (
        <p className="text-[10px] text-muted-foreground leading-snug">
          Benchmark: {c.benchmark.source}
        </p>
      )}
    </div>
  );
}

export function BenchmarkCard() {
  const [period, setPeriod] = useState<Period>("90d");
  const [data, setData] = useState<BenchmarksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (p: Period) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/benchmarks?period=${p}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json = (await res.json()) as BenchmarksResponse;
      setData(json);
    } catch {
      setError("Could not load benchmark data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(period);
  }, [fetchData, period]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4 text-primary" />
            Engagement Benchmarks
          </CardTitle>
          <CardDescription>
            How your engagement compares to industry averages
          </CardDescription>
        </div>

        {/* Period selector */}
        <div className="flex gap-1 flex-shrink-0">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={period === p ? "default" : "ghost"}
              className="h-7 px-2 text-xs"
              onClick={() => {
                setPeriod(p);
                void fetchData(p);
              }}
            >
              {p === "all" ? "All" : p}
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardContent>
        {loading && (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            Loading…
          </div>
        )}

        {!loading && error && (
          <div className="flex items-center justify-center py-8 text-sm text-destructive">
            {error}
          </div>
        )}

        {!loading && !error && data && data.comparisons.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <BarChart3 className="h-8 w-8 opacity-30" />
            <p>No published posts with insights yet.</p>
            <p className="text-xs">Sync insights on published posts to see benchmarks.</p>
          </div>
        )}

        {!loading && !error && data && data.comparisons.length > 0 && (
          <div className="flex flex-col gap-3">
            {data.comparisons.map((c) => (
              <PlatformRow key={c.platform} c={c} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
