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
import { Type } from "lucide-react";
import type { WordCloudResponse } from "@/app/api/analytics/word-cloud/route";

type Period = "7d" | "30d" | "90d";

const PERIOD_LABELS: Record<Period, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

// Colour palette — cycles through these for visual variety
const COLOURS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f59e0b",
  "#10b981", "#3b82f6", "#ef4444", "#14b8a6",
];

function pickColour(index: number): string {
  return COLOURS[index % COLOURS.length] ?? "#6366f1";
}

/** Map count to a font-size between minPx and maxPx using linear interpolation. */
function fontSize(count: number, min: number, max: number, minPx: number, maxPx: number): number {
  if (max === min) return (minPx + maxPx) / 2;
  return minPx + ((count - min) / (max - min)) * (maxPx - minPx);
}

export function WordCloudCard() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<WordCloudResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (p: Period) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/word-cloud?period=${p}`);
      if (!res.ok) throw new Error("Failed to fetch word cloud");
      const json = (await res.json()) as WordCloudResponse;
      setData(json);
    } catch {
      setError("Failed to load word cloud data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(period);
  }, [period, fetchData]);

  const minCount = data?.words.length ? Math.min(...data.words.map((w) => w.count)) : 1;
  const maxCount = data?.words.length ? Math.max(...data.words.map((w) => w.count)) : 1;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Type className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Word Cloud</CardTitle>
          </div>
          <div className="flex gap-1 rounded-lg border bg-background p-1">
            {(["7d", "30d", "90d"] as Period[]).map((p) => (
              <Button
                key={p}
                variant={period === p ? "default" : "ghost"}
                size="sm"
                onClick={() => setPeriod(p)}
                className="h-7 px-2 text-xs"
              >
                {PERIOD_LABELS[p]}
              </Button>
            ))}
          </div>
        </div>
        <CardDescription>
          Most-used words in your published posts ({PERIOD_LABELS[period]})
        </CardDescription>
      </CardHeader>

      <CardContent>
        {loading && (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        )}

        {error && !loading && (
          <div className="flex h-40 items-center justify-center text-sm text-red-500">
            {error}
          </div>
        )}

        {!loading && !error && (!data || data.words.length === 0) && (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Type className="h-8 w-8 opacity-40" />
            <p className="text-sm">No published posts in this period yet.</p>
          </div>
        )}

        {!loading && !error && data && data.words.length > 0 && (
          <>
            <div className="flex min-h-40 flex-wrap items-center justify-center gap-x-3 gap-y-2 py-2">
              {data.words.map((word, idx) => (
                <span
                  key={word.text}
                  title={`${word.text}: ${word.count} occurrence${word.count !== 1 ? "s" : ""}`}
                  style={{
                    fontSize: `${fontSize(word.count, minCount, maxCount, 11, 34)}px`,
                    color: pickColour(idx),
                    lineHeight: 1.2,
                    fontWeight: word.count > (maxCount * 0.6) ? 700 : 400,
                    cursor: "default",
                    userSelect: "none",
                  }}
                >
                  {word.text}
                </span>
              ))}
            </div>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Based on {data.totalPosts} published post{data.totalPosts !== 1 ? "s" : ""}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
