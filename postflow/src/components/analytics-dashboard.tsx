"use client";

import { useEffect, useState, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart2, CheckCircle2, XCircle, Clock, TrendingUp, Settings2 } from "lucide-react";
import { BestTimesCard } from "@/components/best-times-card";
import { WordCloudCard } from "@/components/word-cloud-card";
import { ConsistencyCard } from "@/components/consistency-card";
import { SchedulingAdvisorCard } from "@/components/scheduling-advisor-card";
import { HashtagPerformanceCard } from "@/components/hashtag-performance-card";
import { PostingHeatmapCard } from "@/components/posting-heatmap-card";
import { ContentMixCard } from "@/components/content-mix-card";
import { BenchmarkCard } from "@/components/benchmark-card";
import { ContentGapCard } from "@/components/content-gap-card";
import { DashboardCustomizeDialog } from "@/components/dashboard-customize-dialog";
import { SavedAnalyticsViews } from "@/components/saved-analytics-views";
import type { WidgetConfig } from "@/app/api/dashboard-widgets/route";

type Period = "7d" | "30d" | "90d";

interface DashboardData {
  period: Period;
  kpis: {
    total: number;
    published: number;
    failed: number;
    scheduled: number;
    draft: number;
    successRate: number;
  };
  timeSeries: { date: string; created: number; published: number; failed: number }[];
  platformDist: { platform: string; published: number; failed: number; pending: number; total: number }[];
  hourlyActivity: { hour: number; count: number }[];
}

const PLATFORM_COLORS: Record<string, string> = {
  FACEBOOK: "#1877f2",
  INSTAGRAM: "#e1306c",
  THREADS: "#101010",
};

const PERIOD_LABELS: Record<Period, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

function formatDate(dateStr: string, period: Period): string {
  const d = new Date(dateStr);
  if (period === "90d") {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatHour(hour: number): string {
  if (hour === 0) return "12am";
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return "12pm";
  return `${hour - 12}pm`;
}

function useWidgetConfig() {
  const [widgets, setWidgets] = useState<WidgetConfig[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/dashboard-widgets")
      .then((r) => r.json())
      .then((data: { widgets: WidgetConfig[] }) => {
        setWidgets(data.widgets ?? []);
      })
      .catch(() => {
        // default: show all
      })
      .finally(() => setLoaded(true));
  }, []);

  function isVisible(key: string): boolean {
    if (!loaded) return true;
    const w = widgets.find((x) => x.widgetKey === key);
    return w?.visible ?? true;
  }

  return { widgets, setWidgets, isVisible };
}

export function AnalyticsDashboard() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const { widgets, setWidgets, isVisible } = useWidgetConfig();

  const fetchData = useCallback(async (p: Period) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/dashboard?period=${p}`);
      if (!res.ok) throw new Error("Failed to fetch analytics");
      const json = (await res.json()) as DashboardData;
      setData(json);
    } catch {
      setError("Failed to load analytics data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(period);
  }, [period, fetchData]);

  const handlePeriodChange = (p: Period) => {
    setPeriod(p);
  };

  return (
    <div className="flex flex-col gap-8 p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground">
            Publishing performance and activity insights
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SavedAnalyticsViews
            currentPeriod={period}
            onApply={(config) => {
              const p = config.period as Period | undefined;
              if (p && ["7d", "30d", "90d"].includes(p)) {
                handlePeriodChange(p);
              }
            }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCustomizeOpen(true)}
            className="gap-2"
          >
            <Settings2 className="h-4 w-4" />
            Customize
          </Button>
          {/* Period selector */}
          <div className="flex gap-1 rounded-lg border bg-card p-1">
            {(["7d", "30d", "90d"] as Period[]).map((p) => (
              <Button
                key={p}
                variant={period === p ? "default" : "ghost"}
                size="sm"
                onClick={() => handlePeriodChange(p)}
                className="h-8 px-3 text-xs"
              >
                {PERIOD_LABELS[p]}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* KPI cards */}
      {isVisible("kpis") && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Posts</CardTitle>
              <BarChart2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loading ? "—" : data?.kpis.total ?? 0}
              </div>
              <p className="text-xs text-muted-foreground">
                {loading ? "" : `${data?.kpis.draft ?? 0} draft · ${data?.kpis.scheduled ?? 0} scheduled`}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Published</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loading ? "—" : data?.kpis.published ?? 0}
              </div>
              <p className="text-xs text-muted-foreground">
                {loading
                  ? ""
                  : `${data?.kpis.total ? Math.round(((data?.kpis.published ?? 0) / data.kpis.total) * 100) : 0}% of all posts`}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Failed</CardTitle>
              <XCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loading ? "—" : data?.kpis.failed ?? 0}
              </div>
              <p className="text-xs text-muted-foreground">publish attempts failed</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loading ? "—" : `${data?.kpis.successRate ?? 0}%`}
              </div>
              <p className="text-xs text-muted-foreground">
                {loading ? "" : `${PERIOD_LABELS[period]} publish results`}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts row 1 */}
      {(isVisible("line_chart") || isVisible("platform_dist")) && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Line chart — posts over time */}
          {isVisible("line_chart") && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Posts Over Time</CardTitle>
                <CardDescription>Daily created vs published ({PERIOD_LABELS[period]})</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                    Loading…
                  </div>
                ) : data && data.timeSeries.length > 0 ? (
                  <ResponsiveContainer width="100%" height={264}>
                    <LineChart data={data.timeSeries} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v: string) => formatDate(v, period)}
                        interval={period === "7d" ? 0 : period === "30d" ? 4 : 9}
                      />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip
                        labelFormatter={(label: string) =>
                          new Date(label).toLocaleDateString("en-US", {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          })
                        }
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="created"
                        name="Created"
                        stroke="#6366f1"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="published"
                        name="Published"
                        stroke="#22c55e"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="failed"
                        name="Failed"
                        stroke="#ef4444"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                    No data for this period
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Pie chart — platform distribution */}
          {isVisible("platform_dist") && (
            <Card className={isVisible("line_chart") ? "" : "lg:col-span-3"}>
              <CardHeader>
                <CardTitle>Platform Distribution</CardTitle>
                <CardDescription>Published posts by platform</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                    Loading…
                  </div>
                ) : data && data.platformDist.some((p) => p.total > 0) ? (
                  <ResponsiveContainer width="100%" height={264}>
                    <PieChart>
                      <Pie
                        data={data.platformDist.filter((p) => p.total > 0)}
                        dataKey="published"
                        nameKey="platform"
                        cx="50%"
                        cy="45%"
                        outerRadius={80}
                        label={({ platform, percent }: { platform: string; percent: number }) =>
                          `${platform.charAt(0) + platform.slice(1).toLowerCase()} ${Math.round(percent * 100)}%`
                        }
                        labelLine={false}
                      >
                        {data.platformDist
                          .filter((p) => p.total > 0)
                          .map((entry) => (
                            <Cell
                              key={entry.platform}
                              fill={PLATFORM_COLORS[entry.platform] ?? "#94a3b8"}
                            />
                          ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number, name: string) => [value, name]}
                      />
                      <Legend
                        formatter={(value: string) =>
                          value.charAt(0) + value.slice(1).toLowerCase()
                        }
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                    No platform data yet
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Charts row 2 */}
      {(isVisible("hourly_activity") || isVisible("platform_performance")) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Bar chart — hourly activity */}
          {isVisible("hourly_activity") && (
            <Card>
              <CardHeader>
                <CardTitle>Hourly Activity</CardTitle>
                <CardDescription>When you post most ({PERIOD_LABELS[period]})</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">
                    Loading…
                  </div>
                ) : data && data.hourlyActivity.some((h) => h.count > 0) ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={data.hourlyActivity} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis
                        dataKey="hour"
                        tick={{ fontSize: 10 }}
                        tickFormatter={formatHour}
                        interval={3}
                      />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip
                        labelFormatter={(label: number) => formatHour(label)}
                        formatter={(value: number) => [value, "Posts"]}
                      />
                      <Bar dataKey="count" name="Posts" fill="#6366f1" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">
                    No data for this period
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Platform performance table */}
          {isVisible("platform_performance") && (
            <Card>
              <CardHeader>
                <CardTitle>Platform Performance</CardTitle>
                <CardDescription>Publish results by platform ({PERIOD_LABELS[period]})</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {loading ? (
                  <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">
                    Loading…
                  </div>
                ) : (
                  data?.platformDist.map(({ platform, published, failed, pending, total }) => {
                    const successRate = total > 0 ? Math.round((published / total) * 100) : 0;
                    const platformLabel = platform.charAt(0) + platform.slice(1).toLowerCase();
                    const color = PLATFORM_COLORS[platform] ?? "#94a3b8";
                    return (
                      <div key={platform}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="font-medium" style={{ color }}>
                            {platformLabel}
                          </span>
                          <span className="text-muted-foreground">
                            {total === 0 ? "No data" : `${successRate}% success`}
                          </span>
                        </div>
                        {total > 0 ? (
                          <>
                            <div className="mb-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-2 rounded-full transition-all"
                                style={{ width: `${successRate}%`, backgroundColor: color }}
                              />
                            </div>
                            <div className="flex gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3 text-green-500" />
                                {published}
                              </span>
                              <span className="flex items-center gap-1">
                                <XCircle className="h-3 w-3 text-red-500" />
                                {failed}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3 text-blue-500" />
                                {pending} pending
                              </span>
                            </div>
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground">No publish attempts</p>
                        )}
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Best Times to Post heatmap */}
      {isVisible("best_times") && <BestTimesCard />}

      {/* Word Cloud */}
      {isVisible("word_cloud") && <WordCloudCard />}

      {/* Hashtag Performance */}
      {isVisible("hashtag_performance") && <HashtagPerformanceCard />}

      {/* Posting Consistency */}
      {isVisible("consistency") && <ConsistencyCard />}

      {/* AI Scheduling Advisor */}
      {isVisible("scheduling_advisor") && <SchedulingAdvisorCard />}

      {/* Year Heatmap */}
      {isVisible("year_heatmap") && <PostingHeatmapCard />}

      {/* Content Mix Analysis */}
      {isVisible("content_mix") && <ContentMixCard />}

      {/* Engagement Benchmarks */}
      {isVisible("benchmarks") && <BenchmarkCard />}

      {/* Content Gap Analysis */}
      {isVisible("content_gaps") && <ContentGapCard />}

      <DashboardCustomizeDialog
        open={customizeOpen}
        onOpenChange={setCustomizeOpen}
        onSave={setWidgets}
      />
    </div>
  );
}
