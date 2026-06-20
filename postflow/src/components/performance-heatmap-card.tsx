"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart2, ChevronLeft, ChevronRight } from "lucide-react";
import type { PerformanceHeatmapResponse } from "@/app/api/analytics/performance-heatmap/route";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const DAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", ""];

type MetricKey = "score" | "likes" | "comments" | "shares" | "reach";

const METRICS: { key: MetricKey; label: string }[] = [
  { key: "score", label: "Score" },
  { key: "likes", label: "Likes" },
  { key: "comments", label: "Comments" },
  { key: "shares", label: "Shares" },
  { key: "reach", label: "Reach" },
];

function cellColour(value: number, max: number): string {
  if (value === 0 || max === 0) return "bg-muted dark:bg-muted/60";
  const ratio = value / max;
  if (ratio <= 0.25) return "bg-blue-100 dark:bg-blue-950";
  if (ratio <= 0.5) return "bg-blue-300 dark:bg-blue-700";
  if (ratio <= 0.75) return "bg-blue-500 dark:bg-blue-500";
  return "bg-blue-700 dark:bg-blue-300";
}

function isoToLabel(date: string): string {
  return new Date(date + "T00:00:00Z").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatValue(value: number, metric: MetricKey): string {
  if (metric === "score") return value.toFixed(1);
  return Math.round(value).toLocaleString();
}

export function PerformanceHeatmapCard() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [metric, setMetric] = useState<MetricKey>("score");
  const [data, setData] = useState<PerformanceHeatmapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{
    date: string;
    value: number;
    postCount: number;
    x: number;
    y: number;
  } | null>(null);

  const fetchData = useCallback(async (y: number, m: MetricKey) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/analytics/performance-heatmap?year=${y}&metric=${m}`
      );
      if (!res.ok) throw new Error("Failed to fetch");
      const json = (await res.json()) as PerformanceHeatmapResponse;
      setData(json);
    } catch {
      setError("Could not load performance heatmap data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(year, metric);
  }, [year, metric, fetchData]);

  // Organise days into week columns × 7 rows
  const weeks: ({ date: string; value: number; postCount: number } | null)[][] = [];
  if (data) {
    const firstDate = new Date(data.days[0].date + "T00:00:00Z");
    // Convert Sun=0 → Mon=0
    const firstDow = (firstDate.getUTCDay() + 6) % 7;

    let col: ({ date: string; value: number; postCount: number } | null)[] =
      Array<null>(firstDow).fill(null);

    for (const day of data.days) {
      col.push(day);
      if (col.length === 7) {
        weeks.push(col);
        col = [];
      }
    }
    if (col.length > 0) {
      while (col.length < 7) col.push(null);
      weeks.push(col);
    }
  }

  // Month label positions
  const monthLabelCols: { month: string; col: number }[] = [];
  if (data && weeks.length > 0) {
    let lastMonth = -1;
    weeks.forEach((week, wi) => {
      for (const cell of week) {
        if (!cell) continue;
        const m = new Date(cell.date + "T00:00:00Z").getUTCMonth();
        if (m !== lastMonth) {
          monthLabelCols.push({ month: MONTHS[m], col: wi });
          lastMonth = m;
        }
        break;
      }
    });
  }

  const metricLabel = METRICS.find((m) => m.key === metric)?.label ?? "Score";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <BarChart2 className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Performance Heatmap</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {/* Metric selector */}
            <div className="flex gap-1">
              {METRICS.map((m) => (
                <Button
                  key={m.key}
                  variant={metric === m.key ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setMetric(m.key)}
                >
                  {m.label}
                </Button>
              ))}
            </div>
            {/* Year navigator */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setYear((y) => y - 1)}
                disabled={year <= 2020}
                aria-label="Previous year"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="w-12 text-center text-sm font-medium tabular-nums">
                {year}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setYear((y) => y + 1)}
                disabled={year >= currentYear}
                aria-label="Next year"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
        <CardDescription>
          {loading
            ? "Loading…"
            : data
            ? `Avg ${metricLabel.toLowerCase()} per day across published posts in ${year}`
            : "Engagement intensity across the year"}
        </CardDescription>
      </CardHeader>

      <CardContent className="overflow-x-auto">
        {loading && (
          <div className="flex h-28 items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        )}

        {error && !loading && (
          <div className="flex h-28 items-center justify-center text-sm text-destructive">
            {error}
          </div>
        )}

        {!loading && !error && data && data.maxValue === 0 && (
          <div className="flex h-28 items-center justify-center text-sm text-muted-foreground">
            No published posts with insights data for {year}.
          </div>
        )}

        {!loading && !error && data && data.maxValue > 0 && (
          <div className="relative" onMouseLeave={() => setTooltip(null)}>
            {/* Month labels */}
            <div className="ml-8 flex text-[10px] text-muted-foreground">
              {monthLabelCols.map(({ month, col }, i) => {
                const nextCol = monthLabelCols[i + 1]?.col ?? weeks.length;
                const width = nextCol - col;
                return (
                  <div
                    key={`${month}-${col}`}
                    style={{ minWidth: `${width * 11}px` }}
                    className="truncate"
                  >
                    {month}
                  </div>
                );
              })}
            </div>

            {/* Grid */}
            <div className="flex gap-0">
              {/* Day-of-week labels */}
              <div className="mr-1 flex flex-col gap-[2px] pt-1 text-[10px] text-muted-foreground">
                {DAY_LABELS.map((label, i) => (
                  <div key={i} className="flex h-[9px] items-center">
                    {label}
                  </div>
                ))}
              </div>

              {/* Weeks */}
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[2px]">
                  {week.map((cell, di) =>
                    cell ? (
                      <div
                        key={cell.date}
                        className={`h-[9px] w-[9px] cursor-default rounded-[1px] ${cellColour(cell.value, data.maxValue)}`}
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const parentRect =
                            e.currentTarget
                              .closest(".relative")!
                              .getBoundingClientRect();
                          setTooltip({
                            date: cell.date,
                            value: cell.value,
                            postCount: cell.postCount,
                            x: rect.left - parentRect.left + rect.width / 2,
                            y: rect.top - parentRect.top - 8,
                          });
                        }}
                      />
                    ) : (
                      <div key={`empty-${wi}-${di}`} className="h-[9px] w-[9px]" />
                    )
                  )}
                </div>
              ))}
            </div>

            {/* Tooltip */}
            {tooltip && (
              <div
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-2 py-1 text-xs shadow-md"
                style={{ left: tooltip.x, top: tooltip.y }}
              >
                <span className="font-medium">
                  {metricLabel}: {formatValue(tooltip.value, metric)}
                </span>{" "}
                ({tooltip.postCount} post{tooltip.postCount !== 1 ? "s" : ""})
                {" · "}
                {isoToLabel(tooltip.date)}
              </div>
            )}

            {/* Legend */}
            <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
              <span>Low</span>
              {[
                "bg-muted dark:bg-muted/60",
                "bg-blue-100 dark:bg-blue-950",
                "bg-blue-300 dark:bg-blue-700",
                "bg-blue-500 dark:bg-blue-500",
                "bg-blue-700 dark:bg-blue-300",
              ].map((cls) => (
                <div key={cls} className={`h-[9px] w-[9px] rounded-[1px] ${cls}`} />
              ))}
              <span>High</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
