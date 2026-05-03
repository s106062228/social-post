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
import { Badge } from "@/components/ui/badge";
import { Activity, AlertTriangle, Flame, TrendingUp } from "lucide-react";
import type { ConsistencyResponse } from "@/app/api/analytics/consistency/route";

type Period = "30d" | "90d" | "180d";

const PERIOD_LABELS: Record<Period, string> = {
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "180d": "Last 180 days",
};

function scoreColour(score: number): string {
  if (score >= 75) return "text-green-600 dark:text-green-400";
  if (score >= 50) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function progressColour(score: number): string {
  if (score >= 75) return "bg-green-500";
  if (score >= 50) return "bg-yellow-500";
  return "bg-red-500";
}

function scoreLabel(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  return "Needs work";
}

export function ConsistencyCard() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<ConsistencyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (p: Period) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/consistency?period=${p}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json = (await res.json()) as ConsistencyResponse;
      setData(json);
    } catch {
      setError("Could not load consistency data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(period);
  }, [period, fetchData]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Posting Consistency</CardTitle>
          </div>
          <div className="flex gap-1">
            {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
              <Button
                key={p}
                variant={period === p ? "default" : "outline"}
                size="sm"
                onClick={() => setPeriod(p)}
                className="h-7 text-xs"
              >
                {p}
              </Button>
            ))}
          </div>
        </div>
        <CardDescription>{PERIOD_LABELS[period]}</CardDescription>
      </CardHeader>

      <CardContent>
        {loading && (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        )}

        {error && !loading && (
          <div className="flex h-32 items-center justify-center text-sm text-destructive">
            {error}
          </div>
        )}

        {!loading && !error && data && (
          <div className="space-y-6">
            {/* Score row */}
            <div className="flex items-end gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Consistency score</p>
                <p className={`text-4xl font-bold tabular-nums ${scoreColour(data.score)}`}>
                  {data.score}
                  <span className="text-xl font-normal text-muted-foreground">%</span>
                </p>
                <p className="text-xs text-muted-foreground">{scoreLabel(data.score)}</p>
              </div>

              <div className="flex flex-1 flex-col gap-2">
                <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-3 rounded-full transition-all ${progressColour(data.score)}`}
                    style={{ width: `${data.score}%` }}
                  />
                </div>
                <div className="flex gap-4 text-sm">
                  <span className="flex items-center gap-1">
                    <Flame className="h-4 w-4 text-orange-500" />
                    <span className="font-medium">{data.streak}</span>
                    <span className="text-muted-foreground">
                      week streak
                    </span>
                  </span>
                  <span className="flex items-center gap-1">
                    <TrendingUp className="h-4 w-4 text-blue-500" />
                    <span className="font-medium">{data.avgPostsPerWeek}</span>
                    <span className="text-muted-foreground">posts/week</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-2xl font-bold">{data.totalPosts}</p>
                <p className="text-xs text-muted-foreground">Total posts</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-2xl font-bold">{data.streak}</p>
                <p className="text-xs text-muted-foreground">Week streak</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-2xl font-bold">{data.gaps.length}</p>
                <p className="text-xs text-muted-foreground">Content gaps</p>
              </div>
            </div>

            {/* Content gaps */}
            {data.gaps.length > 0 ? (
              <div>
                <p className="mb-2 flex items-center gap-1 text-sm font-medium">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  Content gaps detected
                </p>
                <ul className="space-y-1.5">
                  {data.gaps.slice(0, 5).map((gap) => (
                    <li
                      key={gap.start}
                      className="flex items-center justify-between rounded-md border border-yellow-200 bg-yellow-50 px-3 py-1.5 text-xs dark:border-yellow-900 dark:bg-yellow-950/30"
                    >
                      <span className="text-muted-foreground">
                        {gap.start} → {gap.end}
                      </span>
                      <Badge variant="outline" className="text-yellow-700 dark:text-yellow-400">
                        {gap.days}d gap
                      </Badge>
                    </li>
                  ))}
                  {data.gaps.length > 5 && (
                    <li className="text-xs text-muted-foreground">
                      +{data.gaps.length - 5} more gaps
                    </li>
                  )}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No content gaps detected — great work keeping a consistent schedule!
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
