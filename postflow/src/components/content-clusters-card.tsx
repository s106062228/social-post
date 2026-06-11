"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Layers, Loader2, AlertCircle } from "lucide-react";
import type {
  ContentClustersResponse,
} from "@/app/api/analytics/content-clusters/route";

type Period = "30d" | "90d" | "all";

const PERIOD_LABELS: Record<Period, string> = {
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
};

/** Returns a Tailwind bg color class based on cluster index */
function clusterColor(idx: number): string {
  const colors = [
    "bg-indigo-500",
    "bg-violet-500",
    "bg-pink-500",
    "bg-orange-500",
    "bg-amber-500",
    "bg-green-500",
    "bg-teal-500",
    "bg-cyan-500",
    "bg-blue-500",
    "bg-rose-500",
    "bg-lime-500",
    "bg-sky-500",
  ];
  return colors[idx % colors.length];
}

export function ContentClustersCard() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<ContentClustersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (p: Period) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/analytics/content-clusters?period=${p}&maxClusters=12`
      );
      if (!res.ok) throw new Error("Failed to load content clusters");
      const json: ContentClustersResponse = await res.json();
      setData(json);
    } catch {
      setError("Failed to load content cluster data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(period);
  }, [fetchData, period]);

  const handlePeriod = (p: Period) => {
    setPeriod(p);
    fetchData(p);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-muted-foreground" />
          <div>
            <CardTitle>Content Topic Clusters</CardTitle>
            <CardDescription>
              How your posts group by dominant keyword topics
            </CardDescription>
          </div>
        </div>

        {/* Period selector */}
        <div className="flex gap-1 shrink-0">
          {(["30d", "90d", "all"] as Period[]).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={period === p ? "default" : "outline"}
              onClick={() => handlePeriod(p)}
              className="h-7 px-2 text-xs"
            >
              {p === "all" ? "All" : p}
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardContent>
        {loading && (
          <div className="flex h-48 items-center justify-center text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Analysing content clusters…</span>
          </div>
        )}

        {!loading && error && (
          <div className="flex h-48 items-center justify-center text-destructive gap-2">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {!loading && !error && data && data.clusters.length === 0 && (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Layers className="h-8 w-8 opacity-40" />
            <p className="text-sm font-medium">No published posts yet</p>
            <p className="text-xs text-center max-w-xs">
              Once you publish posts, PostFlow will automatically identify
              recurring topics in your content.
            </p>
          </div>
        )}

        {!loading && !error && data && data.clusters.length > 0 && (
          <div className="space-y-4">
            {/* Summary row */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground border-b pb-3">
              <span>
                <strong className="text-foreground">{data.totalPosts}</strong>{" "}
                total posts · {PERIOD_LABELS[period]}
              </span>
              <span>
                <strong className="text-foreground">{data.clusters.length}</strong>{" "}
                topic clusters
              </span>
              {data.uncategorizedCount > 0 && (
                <span>
                  <strong className="text-foreground">
                    {data.uncategorizedCount}
                  </strong>{" "}
                  uncategorised
                </span>
              )}
            </div>

            {/* Cluster grid */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.clusters.map((cluster, idx) => (
                <div
                  key={cluster.topic}
                  className="rounded-lg border bg-card p-3 space-y-2"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block h-2.5 w-2.5 rounded-full ${clusterColor(idx)}`}
                      />
                      <span className="font-medium text-sm capitalize truncate max-w-[120px]">
                        #{cluster.topic}
                      </span>
                    </div>
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {cluster.postCount} post{cluster.postCount !== 1 ? "s" : ""}
                    </Badge>
                  </div>

                  {/* Coverage bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Coverage</span>
                      <span>{cluster.coverage}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${clusterColor(idx)} opacity-80`}
                        style={{ width: `${cluster.coverage}%` }}
                      />
                    </div>
                  </div>

                  {/* Engagement */}
                  {cluster.avgEngagement > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Avg engagement:{" "}
                      <span className="text-foreground font-medium">
                        {cluster.avgEngagement.toLocaleString()}
                      </span>
                    </div>
                  )}

                  {/* Related keywords */}
                  {cluster.relatedKeywords.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {cluster.relatedKeywords.map((kw) => (
                        <span
                          key={kw}
                          className="inline-block rounded px-1.5 py-0.5 text-[10px] bg-muted text-muted-foreground capitalize"
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
