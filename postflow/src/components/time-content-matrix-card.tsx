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
import { Clock } from "lucide-react";
import type {
  TimeContentMatrixCell,
  TimeContentMatrixResponse,
} from "@/app/api/analytics/time-content-matrix/route";
import { formatHourLabel } from "@/app/api/analytics/time-content-matrix/route";

type Period = "7d" | "30d" | "90d" | "all";

const PERIOD_LABELS: Record<Period, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
};

const CATEGORY_LABELS: Record<string, string> = {
  EDUCATIONAL: "Educational",
  PROMOTIONAL: "Promotional",
  ENTERTAINING: "Entertaining",
  ENGAGING: "Engaging",
  INSPIRING: "Inspiring",
  NEWS: "News",
  BEHIND_THE_SCENES: "Behind the Scenes",
  USER_GENERATED: "User Generated",
  UNCATEGORIZED: "Uncategorized",
};

function categoryLabel(key: string): string {
  return CATEGORY_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1).toLowerCase().replace(/_/g, " ");
}

// Interpolate between light green rgb(220,252,231) and dark green rgb(22,163,74)
function cellColor(value: number, maxValue: number): string {
  if (maxValue === 0 || value === 0) return "";
  const ratio = Math.min(1, value / maxValue);
  const r = Math.round(220 + (22 - 220) * ratio);
  const g = Math.round(252 + (163 - 252) * ratio);
  const b = Math.round(231 + (74 - 231) * ratio);
  return `rgb(${r},${g},${b})`;
}

const ALL_HOURS = Array.from({ length: 24 }, (_, i) => i);

export function TimeContentMatrixCard() {
  const [period, setPeriod] = useState<Period>("30d");
  const [platform, setPlatform] = useState<string>("");
  const [data, setData] = useState<TimeContentMatrixResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ cell: TimeContentMatrixCell; x: number; y: number } | null>(null);

  const fetchData = useCallback(async (p: Period, plat: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ period: p });
      if (plat) params.set("platform", plat);
      const res = await fetch(`/api/analytics/time-content-matrix?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json = (await res.json()) as TimeContentMatrixResponse;
      setData(json);
    } catch {
      setError("Failed to load time × content matrix");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(period, platform);
  }, [period, platform, fetchData]);

  // Build lookup: `${hour}:${category}` → cell
  const cellMap = new Map<string, TimeContentMatrixCell>();
  if (data) {
    for (const cell of data.matrix) {
      cellMap.set(`${cell.hour}:${cell.category}`, cell);
    }
  }

  const maxEngagement = data
    ? Math.max(0, ...data.matrix.map((c) => c.avgEngagement))
    : 0;

  const isEmpty =
    !loading && data && (data.categories.length === 0 || data.totalDataPoints === 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-base">Content Type × Time Matrix</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Which content categories perform best at each hour of the day
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {(["7d", "30d", "90d", "all"] as Period[]).map((p) => (
              <Button
                key={p}
                size="sm"
                variant={period === p ? "default" : "outline"}
                className="h-7 text-xs px-2"
                onClick={() => setPeriod(p)}
              >
                {PERIOD_LABELS[p]}
              </Button>
            ))}
            <select
              className="h-7 rounded-md border border-input bg-background px-2 text-xs"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              aria-label="Filter by platform"
            >
              <option value="">All platforms</option>
              <option value="FACEBOOK">Facebook</option>
              <option value="INSTAGRAM">Instagram</option>
              <option value="THREADS">Threads</option>
              <option value="TWITTER">Twitter/X</option>
              <option value="LINKEDIN">LinkedIn</option>
              <option value="TIKTOK">TikTok</option>
              <option value="YOUTUBE">YouTube</option>
              <option value="BLUESKY">Bluesky</option>
              <option value="MASTODON">Mastodon</option>
            </select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-1">
                <div className="h-8 w-28 animate-pulse rounded bg-muted" />
                {Array.from({ length: 8 }).map((__, j) => (
                  <div key={j} className="h-8 flex-1 animate-pulse rounded bg-muted" />
                ))}
              </div>
            ))}
          </div>
        )}

        {!loading && error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {!loading && isEmpty && (
          <div className="py-10 text-center text-muted-foreground">
            <Clock className="mx-auto mb-2 h-8 w-8 opacity-40" />
            <p className="text-sm">No data yet.</p>
            <p className="text-xs mt-1">
              Assign content categories to posts, publish them, and sync engagement insights to see this matrix.
            </p>
          </div>
        )}

        {!loading && !error && data && !isEmpty && (
          <div
            className="overflow-x-auto"
            onMouseLeave={() => setTooltip(null)}
          >
            {tooltip && (
              <div
                className="pointer-events-none fixed z-50 rounded-md border bg-popover px-3 py-2 text-xs shadow-md"
                style={{ top: tooltip.y + 12, left: tooltip.x + 12 }}
              >
                <p className="font-semibold">{categoryLabel(tooltip.cell.category)} @ {formatHourLabel(tooltip.cell.hour)}</p>
                <p>Avg engagement: {tooltip.cell.avgEngagement}</p>
                <p>Posts: {tooltip.cell.postCount}</p>
              </div>
            )}

            <table className="w-max border-collapse text-xs">
              <thead>
                <tr>
                  {/* Corner */}
                  <th className="sticky left-0 bg-card p-1 text-left font-medium text-muted-foreground w-32 min-w-[8rem]">
                    Category ↓ / Hour →
                  </th>
                  {ALL_HOURS.map((h) => (
                    <th
                      key={h}
                      className="p-1 text-center font-medium text-muted-foreground min-w-[2.5rem]"
                    >
                      {formatHourLabel(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.categories.map((category) => (
                  <tr key={category} className="border-t border-border/50">
                    <td className="sticky left-0 bg-card p-1 font-medium text-foreground">
                      {categoryLabel(category)}
                    </td>
                    {ALL_HOURS.map((hour) => {
                      const cell = cellMap.get(`${hour}:${category}`);
                      const bg = cell ? cellColor(cell.avgEngagement, maxEngagement) : "";
                      return (
                        <td key={hour} className="p-0.5 text-center">
                          <div
                            className="flex h-8 w-full cursor-default items-center justify-center rounded text-[10px] font-medium leading-tight transition-opacity hover:opacity-80"
                            style={
                              bg
                                ? {
                                    backgroundColor: bg,
                                    color:
                                      cell && cell.avgEngagement / maxEngagement >= 0.5
                                        ? "white"
                                        : "inherit",
                                  }
                                : { backgroundColor: "transparent" }
                            }
                            onMouseEnter={
                              cell
                                ? (e) =>
                                    setTooltip({
                                      cell,
                                      x: e.clientX,
                                      y: e.clientY,
                                    })
                                : undefined
                            }
                            onMouseMove={
                              cell
                                ? (e) =>
                                    setTooltip((prev) =>
                                      prev ? { ...prev, x: e.clientX, y: e.clientY } : prev
                                    )
                                : undefined
                            }
                            onMouseLeave={() => setTooltip(null)}
                          >
                            {cell ? (
                              <>
                                <span>{cell.avgEngagement}</span>
                              </>
                            ) : (
                              <span className="text-muted-foreground opacity-30">·</span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Legend */}
            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>Intensity (avg engagement):</span>
              <div className="flex items-center gap-1">
                <span>Low</span>
                {[0.1, 0.3, 0.5, 0.7, 1.0].map((ratio) => {
                  const r = Math.round(220 + (22 - 220) * ratio);
                  const g = Math.round(252 + (163 - 252) * ratio);
                  const b = Math.round(231 + (74 - 231) * ratio);
                  return (
                    <div
                      key={ratio}
                      className="h-3 w-5 rounded"
                      style={{ backgroundColor: `rgb(${r},${g},${b})` }}
                    />
                  );
                })}
                <span>High</span>
              </div>
              {data.totalDataPoints > 0 && (
                <span className="ml-auto">
                  {data.totalDataPoints} data point{data.totalDataPoints !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            {/* Recommendations */}
            {data.recommendations.length > 0 && (
              <div className="mt-5">
                <p className="mb-2 text-xs font-semibold text-foreground">
                  Optimal posting times by category
                </p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {data.recommendations.map((rec) => (
                    <div
                      key={rec.category}
                      className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2"
                    >
                      <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-xs">{categoryLabel(rec.category)}</p>
                        <p className="text-[11px] text-muted-foreground">
                          Best at {rec.optimalHourLabel} · avg {rec.avgEngagement} eng
                        </p>
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
