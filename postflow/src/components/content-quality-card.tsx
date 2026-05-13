"use client";

import { useEffect, useState, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import type { ContentQualityResponse } from "@/app/api/analytics/content-quality/route";

type Period = "7d" | "30d" | "90d";

const PERIOD_LABELS: Record<Period, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

const SENTIMENT_COLORS: Record<string, string> = {
  Positive: "#22c55e",
  Neutral: "#94a3b8",
  Negative: "#ef4444",
};

const READABILITY_COLORS: Record<string, string> = {
  "Very Easy": "#22c55e",
  Easy: "#84cc16",
  Medium: "#eab308",
  Hard: "#f97316",
  "Very Hard": "#ef4444",
};

export function ContentQualityCard() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<ContentQualityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (p: Period) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/content-quality?period=${p}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json = (await res.json()) as ContentQualityResponse;
      setData(json);
    } catch {
      setError("Could not load content quality data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(period);
  }, [period, fetchData]);

  const sentimentChartData = data
    ? [
        { name: "Positive", value: data.sentiment.POSITIVE },
        { name: "Neutral", value: data.sentiment.NEUTRAL },
        { name: "Negative", value: data.sentiment.NEGATIVE },
      ]
    : [];

  const readabilityChartData = data
    ? [
        { name: "Very Easy", value: data.readability["very-easy"] },
        { name: "Easy", value: data.readability.easy },
        { name: "Medium", value: data.readability.medium },
        { name: "Hard", value: data.readability.hard },
        { name: "Very Hard", value: data.readability["very-hard"] },
      ]
    : [];

  const isEmpty = data?.totalPosts === 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Content Quality</CardTitle>
          </div>
          <div className="flex gap-1">
            {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
              <Button
                key={p}
                variant={period === p ? "default" : "outline"}
                size="sm"
                onClick={() => setPeriod(p)}
                className="h-7 text-xs"
              >
                {p}
              </Button>
            ))}
          </div>
        </div>
        <CardDescription>
          Sentiment and readability of published posts — {PERIOD_LABELS[period]}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {loading && (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        )}

        {error && !loading && (
          <div className="flex h-48 items-center justify-center text-sm text-destructive">
            {error}
          </div>
        )}

        {!loading && !error && isEmpty && (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            No published posts in this period yet.
          </div>
        )}

        {!loading && !error && data && !isEmpty && (
          <div className="space-y-8">
            {/* Word count stats */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-2xl font-bold tabular-nums">{data.wordCount.avg}</p>
                <p className="text-xs text-muted-foreground">Avg words</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-2xl font-bold tabular-nums">{data.wordCount.median}</p>
                <p className="text-xs text-muted-foreground">Median words</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-2xl font-bold tabular-nums">{data.wordCount.min}</p>
                <p className="text-xs text-muted-foreground">Min words</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-2xl font-bold tabular-nums">{data.wordCount.max}</p>
                <p className="text-xs text-muted-foreground">Max words</p>
              </div>
            </div>

            {/* Charts row */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* Sentiment distribution */}
              <div>
                <p className="mb-2 text-sm font-medium">Sentiment distribution</p>
                {data.sentiment.POSITIVE + data.sentiment.NEUTRAL + data.sentiment.NEGATIVE === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No sentiment data yet. Use "Analyze Sentiment" on posts to populate this chart.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={sentimentChartData} barCategoryGap="30%">
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                        width={24}
                      />
                      <Tooltip
                        formatter={(value: number) => [value, "Posts"]}
                        contentStyle={{ fontSize: 12 }}
                      />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {sentimentChartData.map((entry) => (
                          <Cell
                            key={entry.name}
                            fill={SENTIMENT_COLORS[entry.name] ?? "#94a3b8"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
                {data.sentiment.unanalyzed > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {data.sentiment.unanalyzed} post
                    {data.sentiment.unanalyzed !== 1 ? "s" : ""} not yet analyzed
                  </p>
                )}
              </div>

              {/* Readability distribution */}
              <div>
                <p className="mb-2 text-sm font-medium">Readability distribution</p>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={readabilityChartData} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      width={24}
                    />
                    <Tooltip
                      formatter={(value: number) => [value, "Posts"]}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {readabilityChartData.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={READABILITY_COLORS[entry.name] ?? "#94a3b8"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Sentiment percentages (only when analyzed data exists) */}
            {data.sentiment.POSITIVE + data.sentiment.NEUTRAL + data.sentiment.NEGATIVE > 0 && (
              <div className="flex gap-4 text-sm">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
                  {data.sentiment.positivePercent}% positive
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
                  {data.sentiment.neutralPercent}% neutral
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                  {data.sentiment.negativePercent}% negative
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
