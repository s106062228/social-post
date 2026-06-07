"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Minus, ArrowUpRight, ArrowDownRight } from "lucide-react";
import type { PeriodComparisonResponse } from "@/app/api/analytics/period-comparison/route";

type Period = "7d" | "30d" | "90d";

const PERIOD_LABELS: Record<Period, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

const PREV_PERIOD_LABELS: Record<Period, string> = {
  "7d": "Prior 7 days",
  "30d": "Prior 30 days",
  "90d": "Prior 90 days",
};

interface DeltaBadgeProps {
  delta: number | null;
}

function DeltaBadge({ delta }: DeltaBadgeProps) {
  if (delta === null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" />
        No prior data
      </span>
    );
  }

  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" />
        No change
      </span>
    );
  }

  const isPositive = delta > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${
        isPositive ? "text-green-600" : "text-red-600"
      }`}
    >
      {isPositive ? (
        <ArrowUpRight className="h-3 w-3" />
      ) : (
        <ArrowDownRight className="h-3 w-3" />
      )}
      {Math.abs(delta)}%
    </span>
  );
}

interface KpiCardProps {
  label: string;
  current: number;
  previous: number;
  delta: number | null;
  format?: (v: number) => string;
}

function KpiCard({ label, current, previous, delta, format }: KpiCardProps) {
  const fmt = format ?? ((v: number) => v.toLocaleString());
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{fmt(current)}</p>
      <div className="mt-1 flex items-center gap-2">
        <DeltaBadge delta={delta} />
        <span className="text-xs text-muted-foreground">
          vs {fmt(previous)} prior
        </span>
      </div>
    </div>
  );
}

export function PeriodComparisonCard() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<PeriodComparisonResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (p: Period) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/period-comparison?period=${p}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json = (await res.json()) as PeriodComparisonResponse;
      setData(json);
    } catch {
      setError("Failed to load comparison data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(period);
  }, [period, fetchData]);

  const hasData =
    data !== null &&
    (data.current.posts > 0 || data.previous.posts > 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-indigo-500" />
              Period-over-Period Comparison
            </CardTitle>
            <CardDescription>
              {PERIOD_LABELS[period]} vs {PREV_PERIOD_LABELS[period]}
            </CardDescription>
          </div>
          <div className="flex gap-1 rounded-lg border bg-card p-1 shrink-0">
            {(["7d", "30d", "90d"] as Period[]).map((p) => (
              <Button
                key={p}
                variant={period === p ? "default" : "ghost"}
                size="sm"
                onClick={() => setPeriod(p)}
                className="h-7 px-2.5 text-xs"
              >
                {p}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !hasData ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <TrendingDown className="mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-muted-foreground">
              Not enough data yet
            </p>
            <p className="text-xs text-muted-foreground">
              Publish posts to see period-over-period comparisons
            </p>
          </div>
        ) : (
          <>
            {/* KPI grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                label="Posts Published"
                current={data.current.posts}
                previous={data.previous.posts}
                delta={data.deltas.posts}
              />
              <KpiCard
                label="Total Engagement"
                current={data.current.engagement}
                previous={data.previous.engagement}
                delta={data.deltas.engagement}
              />
              <KpiCard
                label="Total Reach"
                current={data.current.reach}
                previous={data.previous.reach}
                delta={data.deltas.reach}
              />
              <KpiCard
                label="Avg Engagement Rate"
                current={data.current.avgEngagementRate}
                previous={data.previous.avgEngagementRate}
                delta={data.deltas.avgEngagementRate}
                format={(v) => `${v}%`}
              />
            </div>

            {/* Platform breakdown */}
            {(data.current.platformBreakdown.length > 0 ||
              data.previous.platformBreakdown.length > 0) && (
              <div>
                <h4 className="mb-3 text-sm font-semibold">Platform Breakdown</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="pb-2 font-medium">Platform</th>
                        <th className="pb-2 text-right font-medium">
                          {PERIOD_LABELS[period]} Posts
                        </th>
                        <th className="pb-2 text-right font-medium">
                          {PREV_PERIOD_LABELS[period]} Posts
                        </th>
                        <th className="pb-2 text-right font-medium">Change</th>
                        <th className="pb-2 text-right font-medium">
                          {PERIOD_LABELS[period]} Engagement
                        </th>
                        <th className="pb-2 text-right font-medium">
                          {PREV_PERIOD_LABELS[period]} Engagement
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {buildPlatformRows(
                        data.current.platformBreakdown,
                        data.previous.platformBreakdown
                      ).map((row) => (
                        <tr key={row.platform} className="border-b last:border-0">
                          <td className="py-2 font-medium capitalize">
                            {row.platform.charAt(0) +
                              row.platform.slice(1).toLowerCase()}
                          </td>
                          <td className="py-2 text-right">{row.currentPosts}</td>
                          <td className="py-2 text-right text-muted-foreground">
                            {row.previousPosts}
                          </td>
                          <td className="py-2 text-right">
                            <DeltaBadge
                              delta={pctChange(row.currentPosts, row.previousPosts)}
                            />
                          </td>
                          <td className="py-2 text-right">
                            {row.currentEngagement.toLocaleString()}
                          </td>
                          <td className="py-2 text-right text-muted-foreground">
                            {row.previousEngagement.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100 * 10) / 10;
}

interface PlatformRow {
  platform: string;
  currentPosts: number;
  previousPosts: number;
  currentEngagement: number;
  previousEngagement: number;
}

function buildPlatformRows(
  current: { platform: string; posts: number; engagement: number }[],
  previous: { platform: string; posts: number; engagement: number }[]
): PlatformRow[] {
  const platforms = new Set([
    ...current.map((p) => p.platform),
    ...previous.map((p) => p.platform),
  ]);

  const currentMap = new Map(current.map((p) => [p.platform, p]));
  const previousMap = new Map(previous.map((p) => [p.platform, p]));

  return Array.from(platforms)
    .map((platform) => ({
      platform,
      currentPosts: currentMap.get(platform)?.posts ?? 0,
      previousPosts: previousMap.get(platform)?.posts ?? 0,
      currentEngagement: currentMap.get(platform)?.engagement ?? 0,
      previousEngagement: previousMap.get(platform)?.engagement ?? 0,
    }))
    .sort((a, b) => b.currentPosts - a.currentPosts);
}
