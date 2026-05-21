"use client";

import { useState, useCallback, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
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
import { Badge } from "@/components/ui/badge";
import { Mic, AlertCircle, Loader2 } from "lucide-react";

type Period = "7d" | "30d" | "90d";

interface ToneDistributionEntry {
  tone: string;
  count: number;
  percentage: number;
}

interface ToneConsistencyData {
  consistency: number;
  dominantTone: string | null;
  toneDistribution: ToneDistributionEntry[];
  analyzedPosts: number;
  totalPosts: number;
  period: Period;
}

const TONE_COLORS: Record<string, string> = {
  professional: "#3b82f6",
  casual: "#10b981",
  humorous: "#f59e0b",
  inspirational: "#8b5cf6",
  educational: "#06b6d4",
  urgent: "#ef4444",
  friendly: "#ec4899",
  authoritative: "#64748b",
};

const TONE_LABELS: Record<string, string> = {
  professional: "Professional",
  casual: "Casual",
  humorous: "Humorous",
  inspirational: "Inspirational",
  educational: "Educational",
  urgent: "Urgent",
  friendly: "Friendly",
  authoritative: "Authoritative",
};

export function ToneConsistencyCard() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<ToneConsistencyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (p: Period) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/tone-consistency?period=${p}`);
      if (!res.ok) throw new Error("Failed to load tone data");
      const json = (await res.json()) as ToneConsistencyData;
      setData(json);
    } catch {
      setError("Failed to load tone consistency data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(period);
  }, [fetchData, period]);

  const consistencyColor =
    !data || data.consistency === 0
      ? "text-muted-foreground"
      : data.consistency >= 70
      ? "text-green-600 dark:text-green-400"
      : data.consistency >= 40
      ? "text-yellow-600 dark:text-yellow-400"
      : "text-red-600 dark:text-red-400";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mic className="h-5 w-5 text-purple-500" />
            <CardTitle>Tone Consistency</CardTitle>
          </div>
          <div className="flex gap-1">
            {(["7d", "30d", "90d"] as Period[]).map((p) => (
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
          Brand voice consistency based on AI tone analysis of published posts
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && !loading && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {!loading && !error && data && data.analyzedPosts === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Mic className="mx-auto mb-2 h-8 w-8 opacity-30" />
            <p>No tone data yet.</p>
            <p className="mt-1">
              Use the &ldquo;Analyze Tone&rdquo; button on your published posts to get started.
            </p>
          </div>
        )}

        {!loading && !error && data && data.analyzedPosts > 0 && (
          <div className="space-y-6">
            {/* Summary row */}
            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className={`text-3xl font-bold ${consistencyColor}`}>
                  {data.consistency}%
                </div>
                <div className="text-xs text-muted-foreground">Consistency</div>
              </div>
              <div className="flex-1">
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Dominant tone</span>
                  {data.dominantTone && (
                    <Badge
                      className="font-medium capitalize"
                      style={{
                        backgroundColor:
                          (TONE_COLORS[data.dominantTone] ?? "#64748b") + "20",
                        color: TONE_COLORS[data.dominantTone] ?? "#64748b",
                        border: `1px solid ${TONE_COLORS[data.dominantTone] ?? "#64748b"}40`,
                      }}
                    >
                      {TONE_LABELS[data.dominantTone] ?? data.dominantTone}
                    </Badge>
                  )}
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${data.consistency}%` }}
                  />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {data.analyzedPosts} of {data.totalPosts} posts analyzed
                </div>
              </div>
            </div>

            {/* Distribution chart */}
            {data.toneDistribution.length > 0 && (
              <div>
                <div className="mb-2 text-sm font-medium">Tone Distribution</div>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart
                    data={data.toneDistribution}
                    margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
                  >
                    <XAxis
                      dataKey="tone"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: string) =>
                        (TONE_LABELS[v] ?? v).slice(0, 6)
                      }
                    />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      formatter={(value: number) => [value, "Posts"]}
                      labelFormatter={(label: string) =>
                        TONE_LABELS[label] ?? label
                      }
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {data.toneDistribution.map((entry) => (
                        <Cell
                          key={entry.tone}
                          fill={TONE_COLORS[entry.tone] ?? "#64748b"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
