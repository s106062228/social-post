"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Lightbulb } from "lucide-react";
import type { CorrelationsResponse } from "@/app/api/analytics/correlations/route";

type Period = "30d" | "90d" | "all";

const PERIOD_OPTIONS: { label: string; value: Period }[] = [
  { label: "30d", value: "30d" },
  { label: "90d", value: "90d" },
  { label: "All", value: "all" },
];

function multiplierColor(m: number): string {
  if (m >= 2) return "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300";
  if (m >= 1.5) return "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300";
  return "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300";
}

export function CorrelationInsightsCard() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<CorrelationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/analytics/correlations?period=${period}`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch");
        return r.json() as Promise<CorrelationsResponse>;
      })
      .then(setData)
      .catch(() => setError("Failed to load insights"))
      .finally(() => setLoading(false));
  }, [period]);

  const insightCount = data?.insights.length ?? 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-yellow-500" />
              Performance Correlation Insights
            </CardTitle>
            <CardDescription>
              {loading
                ? "Analysing what drives engagement…"
                : insightCount > 0
                  ? `${insightCount} insight${insightCount === 1 ? "" : "s"} found`
                  : "What drives engagement in your posts"}
            </CardDescription>
          </div>
          <div className="flex gap-1">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                  period === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-4">
                <div className="h-4 flex-1 animate-pulse rounded bg-muted" />
                <div className="h-6 w-12 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !data || data.insights.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Lightbulb className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Not enough data yet. Publish more posts to discover what drives
              engagement.
            </p>
            {data && data.totalPosts > 0 && (
              <p className="text-xs text-muted-foreground">
                ({data.totalPosts} post{data.totalPosts === 1 ? "" : "s"} analysed — need more variety)
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {data.insights.map((insight) => (
              <div
                key={insight.dimension}
                className="flex items-start justify-between gap-4 rounded-lg border p-3"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="text-sm font-medium leading-snug">
                    {insight.insight}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {insight.sampleSize} post
                    {insight.sampleSize === 1 ? "" : "s"} in this category
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${multiplierColor(insight.multiplier)}`}
                >
                  {Math.round(insight.multiplier * 10) / 10}×
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
