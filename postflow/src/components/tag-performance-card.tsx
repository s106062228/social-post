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
import { Tag } from "lucide-react";
import type {
  TagPerformanceResponse,
  TagPerformanceStat,
} from "@/app/api/analytics/tag-performance/route";

type Period = "7d" | "30d" | "90d" | "all";

const PERIOD_LABELS: Record<Period, string> = {
  "7d": "7d",
  "30d": "30d",
  "90d": "90d",
  all: "All",
};

function EngagementBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-muted">
      <div
        className="h-1.5 rounded-full bg-primary transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function TagRow({
  stat,
  maxEngagement,
  rank,
}: {
  stat: TagPerformanceStat;
  maxEngagement: number;
  rank: number;
}) {
  return (
    <div className="flex items-center gap-3 py-2 border-b last:border-b-0">
      <span className="w-5 text-right text-xs text-muted-foreground shrink-0">
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
            style={{ backgroundColor: stat.tagColor }}
          />
          <span className="font-medium text-sm truncate">{stat.tagName}</span>
          <Badge variant="secondary" className="ml-auto text-xs shrink-0">
            {stat.postCount} post{stat.postCount !== 1 ? "s" : ""}
          </Badge>
        </div>
        <EngagementBar value={stat.avgEngagement} max={maxEngagement} />
        <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
          <span title="Likes">❤️ {stat.totalLikes}</span>
          <span title="Comments">💬 {stat.totalComments}</span>
          <span title="Shares">🔁 {stat.totalShares}</span>
          <span className="ml-auto font-medium text-foreground">
            {Math.round(stat.avgEngagement)} avg score
          </span>
        </div>
      </div>
    </div>
  );
}

export function TagPerformanceCard() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<TagPerformanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (p: Period) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/analytics/tag-performance?period=${p}`
      );
      if (!res.ok) throw new Error("Failed to fetch tag analytics");
      const json = (await res.json()) as TagPerformanceResponse;
      setData(json);
    } catch {
      setError("Failed to load tag performance data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(period);
  }, [period, fetchData]);

  const maxEngagement =
    data?.tags.length
      ? Math.max(...data.tags.map((t) => t.avgEngagement))
      : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Tag Performance</CardTitle>
          </div>
          <div className="flex gap-1 rounded-lg border bg-background p-1">
            {(["7d", "30d", "90d", "all"] as Period[]).map((p) => (
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
          Tags ranked by average engagement score
        </CardDescription>
      </CardHeader>

      <CardContent>
        {loading && (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-2">
                <div className="h-3 w-4 rounded bg-muted animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
                  <div className="h-1.5 w-full rounded-full bg-muted animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        )}

        {error && !loading && (
          <div className="flex h-40 items-center justify-center text-sm text-red-500">
            {error}
          </div>
        )}

        {!loading && !error && (!data || data.tags.length === 0) && (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Tag className="h-8 w-8 opacity-40" />
            <p className="text-sm">No data yet for this period.</p>
            <p className="text-xs text-center max-w-xs">
              Tag your posts and sync insights to see performance by tag.
            </p>
          </div>
        )}

        {!loading && !error && data && data.tags.length > 0 && (
          <>
            <div>
              {data.tags.map((stat, idx) => (
                <TagRow
                  key={stat.tagId}
                  stat={stat}
                  maxEngagement={maxEngagement}
                  rank={idx + 1}
                />
              ))}
            </div>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Based on {data.totalTaggedPosts} tagged post
              {data.totalTaggedPosts !== 1 ? "s" : ""}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
