"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, RefreshCw } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { ContentROIResponse } from "@/app/api/analytics/content-roi/route";

const PERIOD_OPTIONS = [
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "90d", value: "90d" },
  { label: "All", value: "all" },
] as const;

const PIE_COLORS = [
  "#6366f1",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#3b82f6",
  "#ec4899",
];

const TYPE_LABELS: Record<string, string> = {
  SALE: "Sale",
  LEAD: "Lead",
  SIGNUP: "Sign-up",
  DOWNLOAD: "Download",
  CLICK: "Click",
  OTHER: "Other",
};

function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function ContentROICard() {
  const [period, setPeriod] = useState<"7d" | "30d" | "90d" | "all">("30d");
  const [data, setData] = useState<ContentROIResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/content-roi?period=${period}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json = (await res.json()) as ContentROIResponse;
      setData(json);
    } catch {
      setError("Could not load ROI data.");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const pieData =
    data?.conversionsByType.map((ct) => ({
      name: TYPE_LABELS[ct.type] ?? ct.type,
      value: ct.count,
    })) ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Content ROI &amp; Conversions
          </CardTitle>
          <CardDescription>
            Track conversion outcomes attributed to your posts
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border overflow-hidden">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                className={`px-2 py-1 text-xs font-medium transition-colors ${
                  period === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-background hover:bg-muted"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void fetchData()}
            disabled={loading}
            className="h-8 w-8"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            <div className="h-8 bg-muted rounded animate-pulse" />
            <div className="h-40 bg-muted rounded animate-pulse" />
            <div className="h-24 bg-muted rounded animate-pulse" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !data || data.totalConversions === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <TrendingUp className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm font-medium text-muted-foreground">
              No conversions logged yet
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Use the &quot;Log Conversion&quot; button on your posts to track ROI.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary KPIs */}
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold">{data.totalConversions}</p>
                <p className="text-xs text-muted-foreground">Total Conversions</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">
                  {formatCurrency(data.totalRevenue)}
                </p>
                <p className="text-xs text-muted-foreground">Total Revenue</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">
                  {data.avgRevenue > 0
                    ? formatCurrency(data.avgRevenue)
                    : "—"}
                </p>
                <p className="text-xs text-muted-foreground">Avg Revenue</p>
              </div>
            </div>

            {/* Conversion type pie chart */}
            {pieData.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">By Conversion Type</p>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      outerRadius={70}
                      dataKey="value"
                      label={({ name, percent }: { name: string; percent: number }) =>
                        `${name} ${Math.round(percent * 100)}%`
                      }
                      labelLine={false}
                    >
                      {pieData.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={PIE_COLORS[index % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        `${value} conversions`,
                        name,
                      ]}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Top posts by count */}
            {data.topPostsByCount.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Top Posts by Conversions</p>
                <div className="space-y-2">
                  {data.topPostsByCount.map((post, i) => (
                    <div
                      key={post.postId}
                      className="flex items-start gap-3 rounded-md border p-2"
                    >
                      <span className="flex-shrink-0 text-xs font-bold text-muted-foreground w-4">
                        #{i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs truncate text-muted-foreground">
                          {post.content}
                        </p>
                      </div>
                      <div className="flex-shrink-0 flex items-center gap-2">
                        <Badge variant="secondary">{post.count}</Badge>
                        {post.totalRevenue > 0 && (
                          <Badge variant="outline" className="text-green-600">
                            {formatCurrency(post.totalRevenue)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top posts by revenue (only if different from by-count) */}
            {data.topPostsByRevenue.length > 0 &&
              data.totalRevenue > 0 &&
              JSON.stringify(data.topPostsByRevenue.map((p) => p.postId)) !==
                JSON.stringify(data.topPostsByCount.map((p) => p.postId)) && (
                <div>
                  <p className="text-sm font-medium mb-2">Top Posts by Revenue</p>
                  <div className="space-y-2">
                    {data.topPostsByRevenue.map((post, i) => (
                      <div
                        key={post.postId}
                        className="flex items-start gap-3 rounded-md border p-2"
                      >
                        <span className="flex-shrink-0 text-xs font-bold text-muted-foreground w-4">
                          #{i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs truncate text-muted-foreground">
                            {post.content}
                          </p>
                        </div>
                        <div className="flex-shrink-0">
                          <Badge variant="outline" className="text-green-600">
                            {formatCurrency(post.totalRevenue)}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
