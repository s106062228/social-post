"use client";

import { useEffect, useState, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import type { MonthlySummaryResponse } from "@/app/api/analytics/monthly-summary/route";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const STATUS_COLORS: Record<string, string> = {
  PUBLISHED: "#22c55e",
  SCHEDULED: "#3b82f6",
  FAILED: "#ef4444",
  DRAFT: "#94a3b8",
  PUBLISHING: "#f59e0b",
  PARTIALLY_PUBLISHED: "#f97316",
};

function StatusBar({
  status,
  count,
  total,
}: {
  status: string;
  count: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const color = STATUS_COLORS[status] ?? "#94a3b8";
  const label = status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ");

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium" style={{ color }}>
          {label}
        </span>
        <span className="text-muted-foreground">
          {count} ({pct}%)
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-2 rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

export function MonthlySummaryCard() {
  const now = new Date();
  const [year, setYear] = useState<number>(now.getUTCFullYear());
  const [month, setMonth] = useState<number>(now.getUTCMonth() + 1);
  const [data, setData] = useState<MonthlySummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (y: number, m: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/analytics/monthly-summary?year=${y}&month=${m}`
      );
      if (!res.ok) throw new Error("Failed to fetch monthly summary");
      const json = (await res.json()) as MonthlySummaryResponse;
      setData(json);
    } catch {
      setError("Failed to load monthly summary");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(year, month);
  }, [year, month, fetchData]);

  function prevMonth() {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else {
      setMonth((m) => m + 1);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Monthly Summary</CardTitle>
          </div>
          {/* Month navigation */}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={prevMonth} className="h-7 w-7">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-32 text-center text-sm font-medium">
              {MONTH_NAMES[month - 1]} {year}
            </span>
            <Button variant="ghost" size="icon" onClick={nextMonth} className="h-7 w-7">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <CardDescription>
          Post activity summary for {MONTH_NAMES[month - 1]} {year}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {loading && (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        )}

        {error && !loading && (
          <div className="flex h-48 items-center justify-center text-sm text-red-500">
            {error}
          </div>
        )}

        {!loading && !error && (!data || data.totalPosts === 0) && (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
            <CalendarDays className="h-8 w-8 opacity-40" />
            <p className="text-sm">No posts this month.</p>
          </div>
        )}

        {!loading && !error && data && data.totalPosts > 0 && (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Total Posts</p>
                <p className="mt-1 text-2xl font-semibold">{data.totalPosts}</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Avg / Day</p>
                <p className="mt-1 text-2xl font-semibold">{data.avgPostsPerDay}</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Quiet Days</p>
                <p className="mt-1 text-2xl font-semibold">{data.quietDays}</p>
              </div>
              {data.busiestDay && (
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Busiest Day</p>
                  <p className="mt-1 text-lg font-semibold">
                    {new Date(data.busiestDay.date + "T12:00:00Z").toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {data.busiestDay.count} post{data.busiestDay.count !== 1 ? "s" : ""}
                  </p>
                </div>
              )}
            </div>

            {/* Status breakdown */}
            {Object.keys(data.byStatus).length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-medium">By Status</p>
                {Object.entries(data.byStatus).map(([status, count]) => (
                  <StatusBar
                    key={status}
                    status={status}
                    count={count}
                    total={data.totalPosts}
                  />
                ))}
              </div>
            )}

            {/* Platform chips */}
            {data.byPlatform.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium">By Platform</p>
                <div className="flex flex-wrap gap-2">
                  {data.byPlatform.map(({ platform, count }) => (
                    <span
                      key={platform}
                      className="flex items-center gap-1 rounded-full border bg-muted/40 px-3 py-1 text-sm font-medium"
                    >
                      {platform.charAt(0) + platform.slice(1).toLowerCase()}
                      <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        {count}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Weekday distribution */}
            <div>
              <p className="mb-2 text-sm font-medium">Posts by day of week</p>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart
                  data={data.weekdayDistribution}
                  margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis
                    dataKey="dayName"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Bar
                    dataKey="count"
                    fill="#3b82f6"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={32}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <p className="text-center text-xs text-muted-foreground">
              {data.totalPosts} post{data.totalPosts !== 1 ? "s" : ""} in{" "}
              {MONTH_NAMES[month - 1]} {year}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
