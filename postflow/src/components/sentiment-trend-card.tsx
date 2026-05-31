"use client";

import { useState, useCallback, useEffect } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Smile, AlertCircle, Loader2 } from "lucide-react";

type Period = "30d" | "90d" | "180d";

interface SentimentDay {
  date: string;
  positive: number;
  neutral: number;
  negative: number;
  total: number;
}

interface SentimentTrendData {
  period: Period;
  days: SentimentDay[];
  summary: {
    positive: number;
    neutral: number;
    negative: number;
    total: number;
    positiveRate: number;
  };
}

function formatDate(dateStr: string, period: Period): string {
  const d = new Date(dateStr + "T00:00:00");
  if (period === "180d") {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function tickInterval(period: Period): number {
  if (period === "30d") return 4;
  if (period === "90d") return 9;
  return 18;
}

export function SentimentTrendCard() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<SentimentTrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (p: Period) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/sentiment-trend?period=${p}`);
      if (!res.ok) throw new Error("Failed to load sentiment data");
      const json = (await res.json()) as SentimentTrendData;
      setData(json);
    } catch {
      setError("Failed to load sentiment trend data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(period);
  }, [fetchData, period]);

  const hasData = data && data.summary.total > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smile className="h-5 w-5 text-yellow-500" />
            <CardTitle>Sentiment Trend</CardTitle>
          </div>
          <div className="flex gap-1">
            {(["30d", "90d", "180d"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                  period === p
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <CardDescription>
          Daily sentiment distribution of AI-analyzed published posts
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && !loading && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {!loading && !error && !hasData && (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Smile className="mx-auto mb-2 h-8 w-8 opacity-30" />
            <p>No sentiment data yet.</p>
            <p className="mt-1">
              Use the &ldquo;Analyze Sentiment&rdquo; button on your published posts to get started.
            </p>
          </div>
        )}

        {!loading && !error && hasData && data && (
          <div className="space-y-4">
            {/* Summary pills */}
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                Positive: {data.summary.positive} ({data.summary.positiveRate}%)
              </div>
              <div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <span className="h-2 w-2 rounded-full bg-slate-400" />
                Neutral: {data.summary.neutral}
              </div>
              <div className="flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
                <span className="h-2 w-2 rounded-full bg-red-400" />
                Negative: {data.summary.negative}
              </div>
              <div className="ml-auto text-xs text-muted-foreground">
                {data.summary.total} posts analyzed
              </div>
            </div>

            {/* Stacked area chart */}
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart
                data={data.days}
                margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorPositive" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="colorNeutral" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="colorNegative" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f87171" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f87171" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: string) => formatDate(v, period)}
                  interval={tickInterval(period)}
                />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  labelFormatter={(label: unknown) =>
                    new Date(String(label) + "T00:00:00").toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })
                  }
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="positive"
                  name="Positive"
                  stackId="1"
                  stroke="#22c55e"
                  fill="url(#colorPositive)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="neutral"
                  name="Neutral"
                  stackId="1"
                  stroke="#94a3b8"
                  fill="url(#colorNeutral)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="negative"
                  name="Negative"
                  stackId="1"
                  stroke="#f87171"
                  fill="url(#colorNegative)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
