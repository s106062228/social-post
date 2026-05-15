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
import { TrendingUp } from "lucide-react";
import type {
  AudienceMetricsResponse,
  AudienceAccountMetrics,
} from "@/app/api/audience/metrics/route";

// ── Types ─────────────────────────────────────────────────────────────────────

type Period = "7d" | "30d" | "90d";

const PERIOD_LABELS: Record<Period, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

const PERIOD_DAYS: Record<Period, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

// Palette of colours for different account lines
const LINE_COLORS = [
  "#6366f1", // indigo
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#22c55e", // green
  "#ef4444", // red
  "#3b82f6", // blue
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Format a date string as "MMM D"
 */
function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Filter metrics to only include entries within the selected period.
 */
function filterByPeriod(
  metrics: AudienceAccountMetrics["metrics"],
  days: number
): AudienceAccountMetrics["metrics"] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return metrics.filter((m) => new Date(m.syncedAt) >= cutoff);
}

/**
 * Build the combined chart data array from all account metrics,
 * merging by syncedAt day label.
 */
function buildChartData(
  accounts: AudienceAccountMetrics[],
  period: Period
): Record<string, string | number | null>[] {
  const days = PERIOD_DAYS[period];

  // Collect all unique dates across all accounts
  const dateSet = new Set<string>();
  for (const account of accounts) {
    const filtered = filterByPeriod(account.metrics, days);
    for (const m of filtered) {
      dateSet.add(formatDate(m.syncedAt));
    }
  }

  // Build a row per date with a column per account
  const sortedDates = Array.from(dateSet).sort((a, b) => {
    // Parse dates for reliable sort
    return new Date(a).getTime() - new Date(b).getTime();
  });

  return sortedDates.map((date) => {
    const row: Record<string, string | number | null> = { date };
    for (const account of accounts) {
      const filtered = filterByPeriod(account.metrics, days);
      // Find the latest metric for this date
      const match = filtered
        .filter((m) => formatDate(m.syncedAt) === date)
        .pop();
      row[account.accountId] = match?.followersCount ?? null;
    }
    return row;
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AudienceGrowthCard() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<AudienceMetricsResponse | null>(null);
  const [visibleAccounts, setVisibleAccounts] = useState<Set<string>>(
    new Set()
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/audience/metrics");
      if (!res.ok) throw new Error("Failed to fetch audience metrics");
      const json = (await res.json()) as AudienceMetricsResponse;
      setData(json);
      // By default, show all accounts
      setVisibleAccounts(new Set(json.accounts.map((a) => a.accountId)));
    } catch {
      setError("Failed to load audience data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const toggleAccount = (accountId: string) => {
    setVisibleAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) {
        next.delete(accountId);
      } else {
        next.add(accountId);
      }
      return next;
    });
  };

  const hasData =
    data &&
    data.accounts.some((a) =>
      filterByPeriod(a.metrics, PERIOD_DAYS[period]).length > 0
    );

  const visibleAccountList = data?.accounts.filter((a) =>
    visibleAccounts.has(a.accountId)
  );

  const chartData =
    visibleAccountList && visibleAccountList.length > 0
      ? buildChartData(visibleAccountList, period)
      : [];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-indigo-500" />
              Audience Growth
            </CardTitle>
            <CardDescription>
              Follower count over time across your connected accounts
            </CardDescription>
          </div>

          {/* Period selector */}
          <div className="flex gap-1 rounded-lg border bg-background p-1">
            {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
              <Button
                key={p}
                variant={period === p ? "default" : "ghost"}
                size="sm"
                onClick={() => setPeriod(p)}
                className="h-7 px-2 text-xs"
              >
                {PERIOD_LABELS[p]}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {loading && (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        )}

        {!loading && error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        {!loading && !error && !hasData && (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <TrendingUp className="h-8 w-8 opacity-30" />
            <p>No audience data yet.</p>
            <p className="text-xs">
              Follower counts are synced daily for your Facebook, Instagram,
              and X (Twitter) accounts.
            </p>
          </div>
        )}

        {!loading && !error && hasData && data && (
          <div className="space-y-4">
            {/* Account toggles */}
            <div className="flex flex-wrap gap-2">
              {data.accounts.map((account, idx) => {
                const color = LINE_COLORS[idx % LINE_COLORS.length];
                const isVisible = visibleAccounts.has(account.accountId);
                return (
                  <button
                    key={account.accountId}
                    onClick={() => toggleAccount(account.accountId)}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-opacity ${
                      isVisible ? "opacity-100" : "opacity-40"
                    }`}
                    style={{ borderColor: color, color }}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    {account.accountName}
                    <span className="text-muted-foreground">
                      ({account.platform.charAt(0) +
                        account.platform.slice(1).toLowerCase()})
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Chart */}
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart
                  data={chartData}
                  margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                >
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={60}
                    tickFormatter={(v: number) =>
                      v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)
                    }
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => {
                      const account = data.accounts.find(
                        (a) => a.accountId === name
                      );
                      const label = account
                        ? `${account.accountName} (${account.platform})`
                        : name;
                      return [value?.toLocaleString() ?? "—", label];
                    }}
                  />
                  <Legend
                    formatter={(value: string) => {
                      const account = data.accounts.find(
                        (a) => a.accountId === value
                      );
                      return account
                        ? `${account.accountName} (${account.platform})`
                        : value;
                    }}
                  />
                  {data.accounts
                    .filter((a) => visibleAccounts.has(a.accountId))
                    .map((account, idx) => (
                      <Line
                        key={account.accountId}
                        type="monotone"
                        dataKey={account.accountId}
                        stroke={LINE_COLORS[idx % LINE_COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                        connectNulls={false}
                        name={account.accountId}
                      />
                    ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                No data for selected accounts and period.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
