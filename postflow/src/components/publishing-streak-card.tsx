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
import { Flame, Trophy, CalendarDays } from "lucide-react";
import type { PublishingStreakResponse } from "@/app/api/analytics/publishing-streak/route";

export function PublishingStreakCard() {
  const [data, setData] = useState<PublishingStreakResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analytics/publishing-streak");
      if (!res.ok) throw new Error("Failed to fetch");
      const json = (await res.json()) as PublishingStreakResponse;
      setData(json);
    } catch {
      setError("Could not load streak data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-orange-500" />
          <CardTitle>Publishing Streak</CardTitle>
        </div>
        <CardDescription>Last 30 days</CardDescription>
      </CardHeader>

      <CardContent>
        {loading && (
          <div className="space-y-4">
            {/* Skeleton */}
            <div className="h-16 rounded-lg bg-muted animate-pulse" />
            <div className="h-6 w-40 rounded bg-muted animate-pulse" />
            <div className="grid grid-cols-5 gap-1">
              {Array.from({ length: 30 }).map((_, i) => (
                <div key={i} className="h-6 w-6 rounded bg-muted animate-pulse" />
              ))}
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="flex h-32 items-center justify-center text-sm text-destructive">
            {error}
          </div>
        )}

        {!loading && !error && data && (
          <div className="space-y-6">
            {/* Current streak */}
            {data.currentStreak > 0 ? (
              <div className="flex items-end gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Current streak</p>
                  <p className="flex items-baseline gap-1 text-5xl font-bold text-orange-500">
                    🔥 {data.currentStreak}
                    <span className="text-base font-normal text-muted-foreground">
                      day{data.currentStreak !== 1 ? "s" : ""}
                    </span>
                  </p>
                  {data.streakStartDate && (
                    <p className="text-xs text-muted-foreground">
                      Since {data.streakStartDate}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                <Flame className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
                <p className="font-medium">Start your streak!</p>
                <p className="text-xs">Publish a post today to begin a streak.</p>
              </div>
            )}

            {/* Stats row */}
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2">
                <Trophy className="h-4 w-4 text-yellow-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Best streak</p>
                  <p className="font-semibold">
                    {data.longestStreak} day{data.longestStreak !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2">
                <CalendarDays className="h-4 w-4 text-blue-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Active days</p>
                  <p className="font-semibold">{data.totalActiveDays}</p>
                </div>
              </div>
              {data.currentStreak > 0 && (
                <Badge
                  variant="outline"
                  className="border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-400"
                >
                  {data.streakLabel}
                </Badge>
              )}
            </div>

            {/* 30-day dots grid */}
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Last 30 days (newest → oldest)
              </p>
              <div className="grid grid-cols-5 gap-1.5">
                {data.last30Days.map(({ date, count }) => (
                  <div
                    key={date}
                    title={`${date}: ${count} post${count !== 1 ? "s" : ""}`}
                    className={`h-6 w-6 rounded transition-colors ${
                      count > 0
                        ? "bg-green-500 dark:bg-green-400"
                        : "bg-muted"
                    }`}
                  />
                ))}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Hover a dot for details. Green = published that day.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
