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
import { PenLine } from "lucide-react";
import type { WritingStatsResponse } from "@/app/api/analytics/writing-stats/route";

type Period = "30d" | "90d" | "180d" | "all";

const PERIOD_LABELS: Record<Period, string> = {
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "180d": "Last 180 days",
  all: "All time",
};

function StatTile({
  label,
  value,
  suffix = "",
}: {
  label: string;
  value: number | string;
  suffix?: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">
        {value}
        {suffix && (
          <span className="ml-0.5 text-sm font-normal text-muted-foreground">
            {suffix}
          </span>
        )}
      </p>
    </div>
  );
}

export function WritingStatsCard() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<WritingStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (p: Period) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/writing-stats?period=${p}`);
      if (!res.ok) throw new Error("Failed to fetch writing stats");
      const json = (await res.json()) as WritingStatsResponse;
      setData(json);
    } catch {
      setError("Failed to load writing style analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(period);
  }, [period, fetchData]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PenLine className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Writing Style Analytics</CardTitle>
          </div>
          <div className="flex gap-1 rounded-lg border bg-background p-1">
            {(["30d", "90d", "180d", "all"] as Period[]).map((p) => (
              <Button
                key={p}
                variant={period === p ? "default" : "ghost"}
                size="sm"
                onClick={() => setPeriod(p)}
                className="h-7 px-2 text-xs"
              >
                {p === "all" ? "All" : p}
              </Button>
            ))}
          </div>
        </div>
        <CardDescription>
          Patterns in your published post content ({PERIOD_LABELS[period]})
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
            <PenLine className="h-8 w-8 opacity-40" />
            <p className="text-sm">No published posts in this period yet.</p>
          </div>
        )}

        {!loading && !error && data && data.totalPosts > 0 && (
          <>
            {/* Stat grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <StatTile label="Avg words" value={data.avgWordCount} />
              <StatTile label="Avg chars" value={data.avgCharCount} />
              <StatTile
                label="Avg hashtags"
                value={data.avgHashtagCount}
                suffix="#"
              />
              <StatTile
                label="With links"
                value={data.postsWithLinksPercent}
                suffix="%"
              />
              <StatTile
                label="With emojis"
                value={data.postsWithEmojisPercent}
                suffix="%"
              />
            </div>

            {/* Top emojis */}
            {data.topEmojis.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium">Top emojis</p>
                <div className="flex flex-wrap gap-2">
                  {data.topEmojis.map(({ emoji, count }) => (
                    <span
                      key={emoji}
                      className="flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-sm"
                      title={`${count} occurrence${count !== 1 ? "s" : ""}`}
                    >
                      <span className="text-base">{emoji}</span>
                      <span className="text-xs text-muted-foreground">
                        ×{count}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Posting day distribution */}
            <div>
              <p className="mb-2 text-sm font-medium">Posts by day of week</p>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart
                  data={data.postingDayDistribution}
                  margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis
                    dataKey="day"
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
                    fill="#6366f1"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={32}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <p className="text-center text-xs text-muted-foreground">
              Based on {data.totalPosts} published post
              {data.totalPosts !== 1 ? "s" : ""}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
