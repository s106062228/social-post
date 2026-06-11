"use client";

import { useState, useCallback, useEffect } from "react";
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
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Loader2, AlertCircle, RefreshCw, Star, TrendingDown } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import type { SeasonalPatternsResponse } from "@/app/api/analytics/seasonal-patterns/route";
import type { SeasonalTopPost } from "@/lib/seasonal-patterns";

type LookbackYears = 1 | 2 | 3;

type ChartEntry = {
  name: string;
  month: number;
  value: number;
  count: number;
};

const LOOKBACK_LABELS: Record<LookbackYears, string> = {
  1: "1yr",
  2: "2yr",
  3: "3yr",
};

const SHORT_MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function SeasonalPatternsCard() {
  const [lookback, setLookback] = useState<LookbackYears>(2);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [data, setData] = useState<SeasonalPatternsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recyclingId, setRecyclingId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchData = useCallback(async (years: LookbackYears) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/analytics/seasonal-patterns?lookbackYears=${years}`
      );
      if (!res.ok) throw new Error("Failed to load seasonal patterns");
      const json: SeasonalPatternsResponse = await res.json();
      setData(json);
      // Auto-select current month if it has posts, else best month
      const currentMonth = new Date().getMonth() + 1;
      const currentPattern = json.patterns.find((p) => p.month === currentMonth);
      if (currentPattern && currentPattern.postCount > 0) {
        setSelectedMonth(currentMonth);
      } else if (json.bestMonth) {
        setSelectedMonth(json.bestMonth);
      } else {
        setSelectedMonth(null);
      }
    } catch {
      setError("Failed to load seasonal pattern data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(lookback);
  }, [fetchData, lookback]);

  const handleLookback = (y: LookbackYears) => {
    setLookback(y);
    fetchData(y);
  };

  const handleRecycle = async (postId: string) => {
    setRecyclingId(postId);
    try {
      const res = await fetch(`/api/posts/${postId}/recycle`, {
        method: "POST",
      });
      if (!res.ok) throw new Error();
      const json = await res.json() as { id?: string };
      toast({
        title: "Post recycled",
        description: `A new draft has been created${json.id ? ` (ID: ${json.id.slice(0, 8)}…)` : ""}.`,
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to recycle post.",
        variant: "destructive",
      });
    } finally {
      setRecyclingId(null);
    }
  };

  const maxEngagement =
    data?.patterns.reduce((m: number, p: { avgEngagement: number }) => Math.max(m, p.avgEngagement), 0) ?? 1;

  const chartData: ChartEntry[] = data?.patterns.map((p: { month: number; avgEngagement: number; postCount: number }) => ({
    name: SHORT_MONTH_NAMES[p.month - 1],
    month: p.month,
    value: Math.round(p.avgEngagement),
    count: p.postCount,
  })) ?? [];

  const selectedPattern = data?.patterns.find(
    (p: { month: number }) => p.month === selectedMonth
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-muted-foreground" />
          <div>
            <CardTitle>Seasonal Content Patterns</CardTitle>
            <CardDescription>
              Monthly engagement trends to guide recycling decisions
            </CardDescription>
          </div>
        </div>

        {/* Lookback selector */}
        <div className="flex gap-1 shrink-0">
          {([1, 2, 3] as LookbackYears[]).map((y) => (
            <Button
              key={y}
              size="sm"
              variant={lookback === y ? "default" : "outline"}
              onClick={() => handleLookback(y)}
              className="h-7 px-2 text-xs"
            >
              {LOOKBACK_LABELS[y]}
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading && (
          <div className="flex h-48 items-center justify-center text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Analysing seasonal patterns…</span>
          </div>
        )}

        {!loading && error && (
          <div className="flex h-48 items-center justify-center text-destructive gap-2">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {!loading && !error && data && data.totalPosts === 0 && (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
            <CalendarDays className="h-8 w-8 opacity-40" />
            <p className="text-sm font-medium">No published posts yet</p>
            <p className="text-xs text-center max-w-xs">
              Once you publish posts with engagement data, seasonal patterns
              will appear here.
            </p>
          </div>
        )}

        {!loading && !error && data && data.totalPosts > 0 && (
          <>
            {/* Best / worst month chips */}
            <div className="flex flex-wrap gap-2 text-xs">
              {data.bestMonth && (
                <Badge variant="outline" className="gap-1 border-green-500 text-green-700 dark:text-green-400">
                  <Star className="h-3 w-3" />
                  Best: {SHORT_MONTH_NAMES[data.bestMonth - 1]}
                </Badge>
              )}
              {data.worstMonth && data.worstMonth !== data.bestMonth && (
                <Badge variant="outline" className="gap-1 border-red-400 text-red-600 dark:text-red-400">
                  <TrendingDown className="h-3 w-3" />
                  Lowest: {SHORT_MONTH_NAMES[data.worstMonth - 1]}
                </Badge>
              )}
              <span className="text-muted-foreground self-center">
                {data.totalPosts} posts · last {data.lookbackYears} yr
                {data.lookbackYears > 1 ? "s" : ""}
              </span>
            </div>

            {/* Bar chart */}
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 4, right: 4, bottom: 0, left: -10 }}
                  onClick={(e: { activePayload?: Array<{ payload: ChartEntry }> } | null) => {
                    if (e?.activePayload?.[0]) {
                      const payload = e.activePayload[0].payload;
                      if (payload.count > 0) setSelectedMonth(payload.month);
                    }
                  }}
                  style={{ cursor: "pointer" }}
                >
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
                  />
                  <Tooltip
                    formatter={(value: number) => [value, "Avg engagement"]}
                    labelFormatter={(label: string) => {
                      const entry = chartData.find((d: ChartEntry) => d.name === label);
                      return `${label} (${entry?.count ?? 0} posts)`;
                    }}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                    {chartData.map((entry: ChartEntry) => {
                      const isSelected = entry.month === selectedMonth;
                      const isBest = entry.month === data.bestMonth;
                      return (
                        <Cell
                          key={entry.month}
                          fill={
                            isSelected
                              ? "#6366f1"
                              : isBest
                              ? "#22c55e"
                              : entry.count === 0
                              ? "#e5e7eb"
                              : "#a5b4fc"
                          }
                          opacity={entry.count === 0 ? 0.4 : 1}
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Selected month top posts */}
            {selectedPattern && selectedPattern.postCount > 0 && (
              <div className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">
                    Top posts in{" "}
                    <span className="text-primary">
                      {selectedPattern.monthName}
                    </span>
                  </h4>
                  <span className="text-xs text-muted-foreground">
                    {selectedPattern.postCount} post
                    {selectedPattern.postCount !== 1 ? "s" : ""} · avg{" "}
                    {Math.round(selectedPattern.avgEngagement)} eng
                  </span>
                </div>

                <div className="space-y-2">
                  {selectedPattern.topPosts.map((post: SeasonalTopPost) => (
                    <div
                      key={post.postId}
                      className="flex items-start justify-between gap-2 rounded border p-2 bg-muted/30"
                    >
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <p className="text-xs text-foreground truncate">
                          {post.content.slice(0, 80)}
                          {post.content.length > 80 ? "…" : ""}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>
                            {new Date(post.publishedAt).toLocaleDateString(
                              undefined,
                              { month: "short", day: "numeric", year: "numeric" }
                            )}
                          </span>
                          <span>·</span>
                          <span>{post.engagement} engagement</span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs shrink-0 gap-1"
                        onClick={() => handleRecycle(post.postId)}
                        disabled={recyclingId === post.postId}
                      >
                        {recyclingId === post.postId ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}
                        Recycle
                      </Button>
                    </div>
                  ))}
                </div>

                {selectedPattern.avgEngagement < maxEngagement * 0.4 &&
                  data.bestMonth && (
                    <p className="text-xs text-muted-foreground">
                      Tip: Consider scheduling in{" "}
                      {SHORT_MONTH_NAMES[data.bestMonth - 1]} for higher
                      historical engagement.
                    </p>
                  )}
              </div>
            )}

            {selectedPattern && selectedPattern.postCount === 0 && (
              <p className="text-xs text-center text-muted-foreground py-2">
                No posts published in {selectedPattern.monthName}. Click a
                month bar to explore its top posts.
              </p>
            )}

            {!selectedPattern && (
              <p className="text-xs text-center text-muted-foreground py-2">
                Click a month bar to see top posts.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
