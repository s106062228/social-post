"use client";

import { useEffect, useState, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Minus, Activity } from "lucide-react";
import type {
  GrowthVelocityResponse,
  AccountVelocityData,
} from "@/app/api/analytics/growth-velocity/route";

// ── Types ─────────────────────────────────────────────────────────────────────

type Period = "30d" | "90d" | "180d";

const PERIOD_LABELS: Record<Period, string> = {
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "180d": "Last 180 days",
};

const LINE_COLORS = [
  "#6366f1",
  "#ec4899",
  "#14b8a6",
  "#f59e0b",
  "#8b5cf6",
  "#22c55e",
  "#ef4444",
  "#3b82f6",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function MomentumBadge({
  label,
  score,
}: {
  label: AccountVelocityData["momentumLabel"];
  score: number;
}) {
  if (label === "Insufficient Data") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" />
        Insufficient Data
      </span>
    );
  }
  if (label === "Rising") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900 px-2 py-0.5 text-xs text-green-700 dark:text-green-300">
        <TrendingUp className="h-3 w-3" />
        Rising · {score}
      </span>
    );
  }
  if (label === "Stable") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">
        <Minus className="h-3 w-3" />
        Stable · {score}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-900 px-2 py-0.5 text-xs text-red-700 dark:text-red-300">
      <TrendingDown className="h-3 w-3" />
      Declining · {score}
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function GrowthVelocityCard() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<GrowthVelocityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/growth-velocity?period=${period}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as GrowthVelocityResponse;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Build chart data: merge all accounts' dailyFollowers into a shared date axis
  const chartData = (() => {
    if (!data || data.accounts.length === 0) return [];
    const dateSet = new Set<string>();
    for (const acct of data.accounts) {
      for (const pt of acct.dailyFollowers) dateSet.add(pt.date);
    }
    const dates = Array.from(dateSet).sort();
    return dates.map((date) => {
      const row: Record<string, string | number> = { date };
      for (const acct of data.accounts) {
        const pt = acct.dailyFollowers.find((p) => p.date === date);
        if (pt) row[acct.accountName] = pt.followersCount;
      }
      return row;
    });
  })();

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-indigo-500" />
            Growth Velocity Dashboard
          </CardTitle>
          <CardDescription>
            Follower momentum and growth acceleration per connected account
          </CardDescription>
        </div>
        <div className="flex gap-1">
          {(["30d", "90d", "180d"] as Period[]).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={period === p ? "default" : "outline"}
              onClick={() => setPeriod(p)}
            >
              {p}
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Fleet summary */}
        {data && (
          <div className="flex flex-wrap gap-4 rounded-lg border bg-muted/30 p-4">
            <div className="min-w-[120px]">
              <p className="text-xs text-muted-foreground">Fleet Momentum</p>
              <p className="text-2xl font-bold">{data.fleetMomentumScore}</p>
              <p className="text-xs text-muted-foreground">/ 100</p>
            </div>
            {data.topMomentumAccount && (
              <div className="min-w-[140px]">
                <p className="text-xs text-muted-foreground">Top Account</p>
                <p className="truncate text-sm font-semibold">
                  {data.topMomentumAccount}
                </p>
              </div>
            )}
            <div className="min-w-[80px]">
              <p className="text-xs text-muted-foreground">Period</p>
              <p className="text-sm font-medium">
                {PERIOD_LABELS[period]}
              </p>
            </div>
          </div>
        )}

        {/* Chart */}
        {loading ? (
          <div className="space-y-2">
            <div className="h-48 animate-pulse rounded-lg bg-muted" />
          </div>
        ) : error ? (
          <div className="flex h-48 items-center justify-center text-sm text-destructive">
            {error}
          </div>
        ) : !data || data.accounts.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Activity className="h-10 w-10 opacity-30" />
            <p className="text-sm">No audience data yet.</p>
            <p className="text-xs">Connect social accounts and sync audience metrics to see growth velocity.</p>
          </div>
        ) : chartData.length > 0 ? (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={formatDate}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 11 }} width={50} />
                <Tooltip
                  labelFormatter={(v) => formatDate(String(v))}
                  formatter={(value: number, name: string) => [
                    value.toLocaleString(),
                    name,
                  ]}
                />
                <Legend />
                {data.accounts.map((acct, idx) => (
                  <Line
                    key={acct.accountId}
                    type="monotone"
                    dataKey={acct.accountName}
                    stroke={LINE_COLORS[idx % LINE_COLORS.length]}
                    dot={false}
                    strokeWidth={2}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : null}

        {/* Per-account breakdown */}
        {data && data.accounts.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">
              Account Breakdown
            </p>
            {data.accounts.map((acct) => (
              <div
                key={acct.accountId}
                className="flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3"
              >
                <div className="min-w-[130px] flex-1">
                  <p className="truncate text-sm font-medium">{acct.accountName}</p>
                  <p className="text-xs text-muted-foreground">{acct.platform}</p>
                </div>
                <MomentumBadge label={acct.momentumLabel} score={acct.momentumScore} />
                {acct.currentFollowers !== null && (
                  <div className="text-right">
                    <p className="text-sm font-semibold">
                      {acct.currentFollowers.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">followers</p>
                  </div>
                )}
                {acct.followerGainTotal !== null && (
                  <div className="text-right">
                    <p
                      className={`text-sm font-semibold ${
                        acct.followerGainTotal >= 0
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {acct.followerGainTotal >= 0 ? "+" : ""}
                      {acct.followerGainTotal.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">gained</p>
                  </div>
                )}
                {acct.followerVelocityPerDay !== null && (
                  <div className="text-right">
                    <p className="text-sm font-semibold">
                      {acct.followerVelocityPerDay >= 0 ? "+" : ""}
                      {acct.followerVelocityPerDay}/day
                    </p>
                    <p className="text-xs text-muted-foreground">velocity</p>
                  </div>
                )}
                {acct.followerAcceleration !== null && (
                  <div className="text-right">
                    <p
                      className={`text-sm font-semibold ${
                        acct.followerAcceleration > 0
                          ? "text-green-600 dark:text-green-400"
                          : acct.followerAcceleration < 0
                          ? "text-red-600 dark:text-red-400"
                          : ""
                      }`}
                    >
                      {acct.followerAcceleration > 0 ? "+" : ""}
                      {acct.followerAcceleration}
                    </p>
                    <p className="text-xs text-muted-foreground">accel</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
