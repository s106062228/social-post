"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingDown } from "lucide-react";
import type {
  EngagementFunnelResponse,
  FunnelPlatformData,
} from "@/app/api/analytics/engagement-funnel/route";

type Period = "30d" | "90d";

const PERIOD_LABELS: Record<Period, string> = {
  "30d": "30 days",
  "90d": "90 days",
};

function pct(value: number | null): string {
  if (value === null) return "—";
  return `${value.toFixed(1)}%`;
}

function FunnelStep({
  label,
  value,
  sub,
  width,
  color,
}: {
  label: string;
  value: number;
  sub?: string;
  width: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <div className="flex-1 h-7 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color} flex items-center pl-3`}
          style={{ width: `${Math.max(width, 3)}%` }}
        />
      </div>
      <div className="text-right w-24 shrink-0">
        <p className="text-sm font-semibold">{value.toLocaleString()}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

function PlatformRow({ p }: { p: FunnelPlatformData }) {
  return (
    <div className="grid grid-cols-4 gap-2 text-xs py-1.5 border-b last:border-0">
      <span className="font-medium truncate">{p.platform}</span>
      <span className="text-right text-muted-foreground">
        {p.impressions.toLocaleString()}
      </span>
      <span className="text-right text-muted-foreground">
        {p.reach.toLocaleString()}
      </span>
      <span className="text-right font-medium text-violet-600 dark:text-violet-400">
        {pct(p.engagementRate)}
      </span>
    </div>
  );
}

export function EngagementFunnelCard() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<EngagementFunnelResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (p: Period) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics/engagement-funnel?period=${p}`);
      if (res.ok) {
        const json = (await res.json()) as EngagementFunnelResponse;
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

  const hasData = data && data.overall.impressions > 0;

  const maxValue = hasData
    ? Math.max(
        data.overall.impressions,
        data.overall.reach,
        data.overall.engagement
      )
    : 1;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-indigo-500" />
            <CardTitle className="text-base">Engagement Funnel</CardTitle>
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
          Impressions → Reach → Engagement conversion rates across platforms
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-0">
        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-3 bg-muted rounded w-24" />
                <div className="flex-1 h-7 bg-muted rounded-full" />
                <div className="h-5 bg-muted rounded w-20" />
              </div>
            ))}
          </div>
        ) : !hasData ? (
          <div className="text-center py-8 space-y-2">
            <TrendingDown className="h-10 w-10 mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No insights data yet.</p>
            <p className="text-xs text-muted-foreground">
              Sync post insights to see your engagement funnel.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Funnel visualization */}
            <div className="space-y-2">
              <FunnelStep
                label="Impressions"
                value={data.overall.impressions}
                width={100}
                color="bg-indigo-400"
              />
              <FunnelStep
                label="Reach"
                value={data.overall.reach}
                sub={`${pct(data.overall.reachRate)} of impressions`}
                width={(data.overall.reach / maxValue) * 100}
                color="bg-blue-400"
              />
              <FunnelStep
                label="Engagement"
                value={data.overall.engagement}
                sub={`${pct(data.overall.engagementRate)} of impressions`}
                width={(data.overall.engagement / maxValue) * 100}
                color="bg-violet-500"
              />
            </div>

            {/* Conversion rate summary */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-lg font-bold text-blue-600">
                  {pct(data.overall.reachRate)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Reach Rate
                </p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-lg font-bold text-violet-600">
                  {pct(data.overall.engagementRate)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Engagement Rate
                </p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-lg font-bold text-indigo-600">
                  {pct(data.overall.engagementFromReachRate)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Engage / Reach
                </p>
              </div>
            </div>

            {/* Per-platform breakdown */}
            {data.platforms.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Platform Breakdown</p>
                <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground mb-1">
                  <span>Platform</span>
                  <span className="text-right">Impressions</span>
                  <span className="text-right">Reach</span>
                  <span className="text-right">Eng. Rate</span>
                </div>
                {data.platforms.map((p) => (
                  <PlatformRow key={p.platform} p={p} />
                ))}
              </div>
            )}

            {/* Top platform */}
            {data.topPlatform && (
              <p className="text-xs text-muted-foreground">
                Best engagement rate:{" "}
                <span className="font-medium text-foreground">
                  {data.topPlatform}
                </span>
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
