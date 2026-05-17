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
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import type { HeatmapResponse } from "@/app/api/analytics/heatmap/route";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const DAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", ""];

function cellColour(count: number, max: number): string {
  if (count === 0 || max === 0)
    return "bg-muted dark:bg-muted/60";
  const ratio = count / max;
  if (ratio < 0.25) return "bg-green-200 dark:bg-green-900";
  if (ratio < 0.5) return "bg-green-400 dark:bg-green-700";
  if (ratio < 0.75) return "bg-green-600 dark:bg-green-500";
  return "bg-green-800 dark:bg-green-300";
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

export function PostingHeatmapCard() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<HeatmapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ date: string; count: number; x: number; y: number } | null>(null);

  const fetchData = useCallback(async (y: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/heatmap?year=${y}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json = (await res.json()) as HeatmapResponse;
      setData(json);
    } catch {
      setError("Could not load heatmap data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(year);
  }, [year, fetchData]);

  // Organise days into 53 week columns × 7 rows
  // First day of year may not be Monday; pad the start
  const weeks: ({ date: string; count: number } | null)[][] = [];
  if (data) {
    const firstDate = new Date(data.days[0].date + "T00:00:00Z");
    // 0=Sun,1=Mon,...,6=Sat → convert so Mon=0
    const firstDow = (firstDate.getUTCDay() + 6) % 7;

    let col: ({ date: string; count: number } | null)[] = Array<null>(firstDow).fill(null);
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

  // Compute month label positions (week index where each month starts)
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Posting Activity</CardTitle>
          </div>
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
        <CardDescription>
          {loading
            ? "Loading…"
            : data
            ? `${data.totalPosts} posts in ${year}`
            : "Year-round posting frequency"}
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

        {!loading && !error && data && (
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
                        className={`h-[9px] w-[9px] cursor-default rounded-[1px] ${cellColour(cell.count, data.maxDay)}`}
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const parentRect =
                            e.currentTarget
                              .closest(".relative")!
                              .getBoundingClientRect();
                          setTooltip({
                            date: cell.date,
                            count: cell.count,
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
                  {tooltip.count} post{tooltip.count !== 1 ? "s" : ""}
                </span>{" "}
                · {isoToLabel(tooltip.date)}
              </div>
            )}

            {/* Legend */}
            <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
              <span>Less</span>
              {["bg-muted dark:bg-muted/60", "bg-green-200 dark:bg-green-900", "bg-green-400 dark:bg-green-700", "bg-green-600 dark:bg-green-500", "bg-green-800 dark:bg-green-300"].map(
                (cls) => (
                  <div key={cls} className={`h-[9px] w-[9px] rounded-[1px] ${cls}`} />
                )
              )}
              <span>More</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
