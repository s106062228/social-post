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
import type { BestTimesResponse, BestTimeSlot } from "@/app/api/analytics/best-times/route";

type Platform = "ALL" | "FACEBOOK" | "INSTAGRAM" | "THREADS";
type Period = "30d" | "90d" | "all";

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: "ALL", label: "All Platforms" },
  { value: "FACEBOOK", label: "Facebook" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "THREADS", label: "Threads" },
];

const PERIOD_LABELS: Record<Period, string> = {
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatHour(hour: number): string {
  if (hour === 0) return "12am";
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return "12pm";
  return `${hour - 12}pm`;
}

function engagementColour(norm: number): string {
  // norm is 0–1; map to a blue intensity
  if (norm === 0) return "bg-muted";
  if (norm < 0.25) return "bg-indigo-100 dark:bg-indigo-950";
  if (norm < 0.5) return "bg-indigo-200 dark:bg-indigo-800";
  if (norm < 0.75) return "bg-indigo-400 dark:bg-indigo-600";
  return "bg-indigo-600 dark:bg-indigo-400";
}

// Build a 7×24 grid of normalised engagement values
function buildGrid(slots: BestTimeSlot[]): number[][] {
  // grid[day][hour] = avgEngagement
  const grid: number[][] = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  let max = 0;
  for (const s of slots) {
    grid[s.dayOfWeek][s.hour] = s.avgEngagement;
    if (s.avgEngagement > max) max = s.avgEngagement;
  }
  if (max === 0) return grid;
  return grid.map((row) => row.map((v) => v / max));
}

// Top-N recommended slots (by avgEngagement)
function topSlots(slots: BestTimeSlot[], n = 3): BestTimeSlot[] {
  return [...slots].sort((a, b) => b.avgEngagement - a.avgEngagement).slice(0, n);
}

export function BestTimesCard() {
  const [platform, setPlatform] = useState<Platform>("ALL");
  const [period, setPeriod] = useState<Period>("90d");
  const [data, setData] = useState<BestTimesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (p: Platform, per: Period) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ period: per });
      if (p !== "ALL") params.set("platform", p);
      const res = await fetch(`/api/analytics/best-times?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      setData((await res.json()) as BestTimesResponse);
    } catch {
      setError("Failed to load best times data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(platform, period);
  }, [platform, period, fetchData]);

  const grid = data && !data.empty ? buildGrid(data.slots) : null;
  const top = data && !data.empty ? topSlots(data.slots) : [];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-indigo-500" />
              Best Times to Post
            </CardTitle>
            <CardDescription>
              Optimal posting windows based on engagement from your published posts
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Platform selector */}
            <div className="flex gap-1 rounded-lg border bg-background p-1">
              {PLATFORMS.map((p) => (
                <Button
                  key={p.value}
                  variant={platform === p.value ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setPlatform(p.value)}
                  className="h-7 px-2 text-xs"
                >
                  {p.label}
                </Button>
              ))}
            </div>
            {/* Period selector */}
            <div className="flex gap-1 rounded-lg border bg-background p-1">
              {(["30d", "90d", "all"] as Period[]).map((per) => (
                <Button
                  key={per}
                  variant={period === per ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setPeriod(per)}
                  className="h-7 px-2 text-xs"
                >
                  {PERIOD_LABELS[per]}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        )}
        {!loading && error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}
        {!loading && !error && data?.empty && (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <Clock className="h-8 w-8 opacity-30" />
            <p>No engagement data yet.</p>
            <p className="text-xs">Once you have published posts with synced insights, your best times will appear here.</p>
          </div>
        )}
        {!loading && !error && grid && (
          <div className="space-y-6">
            {/* Top recommendations */}
            {top.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Top Recommendations
                </p>
                <div className="flex flex-wrap gap-2">
                  {top.map((s, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-1.5 rounded-full border bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                    >
                      <span className="text-indigo-400">#{i + 1}</span>
                      {DAY_LABELS[s.dayOfWeek]} {formatHour(s.hour)}
                      <span className="text-indigo-400">· {s.sampleSize} posts</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Heatmap grid */}
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Engagement Heatmap (UTC)
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs" style={{ minWidth: 600 }}>
                  <thead>
                    <tr>
                      <th className="w-10 pb-1 text-right pr-2 text-muted-foreground font-normal" />
                      {DAY_LABELS.map((d) => (
                        <th
                          key={d}
                          className="pb-1 text-center font-normal text-muted-foreground"
                          style={{ width: "calc((100% - 40px) / 7)" }}
                        >
                          {d}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 24 }, (_, hour) => (
                      <tr key={hour}>
                        <td className="pr-2 text-right text-muted-foreground leading-none py-[1px]">
                          {hour % 3 === 0 ? formatHour(hour) : ""}
                        </td>
                        {Array.from({ length: 7 }, (__, day) => {
                          const norm = grid[day][hour];
                          return (
                            <td key={day} className="py-[1px] px-[1px]">
                              <div
                                className={`h-3 w-full rounded-sm ${engagementColour(norm)}`}
                                title={`${DAY_LABELS[day]} ${formatHour(hour)}: ${norm > 0 ? `${Math.round(norm * 100)}% relative engagement` : "no data"}`}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Darker cells indicate higher average engagement. Timestamps are UTC.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
