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
import { MessageSquare, Share2, TrendingUp } from "lucide-react";
import type { EngagementDepthResponse, PlatformDepthMetrics, TopDeepPost } from "@/app/api/analytics/engagement-depth/route";

type Period = "7d" | "30d" | "90d" | "all";

const PERIOD_LABELS: Record<Period, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
};

function DepthScoreBadge({ score }: { score: number }) {
  const color =
    score >= 70
      ? "text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900"
      : score >= 40
      ? "text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900"
      : "text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${color}`}
    >
      <TrendingUp className="h-3 w-3" />
      Depth {score}
    </span>
  );
}

export function EngagementDepthCard() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<EngagementDepthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/engagement-depth?period=${period}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as EngagementDepthResponse;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-indigo-500" />
            Engagement Depth & Interaction Quality
          </CardTitle>
          <CardDescription>
            Comment and share rates reveal the quality of audience engagement, not just quantity
          </CardDescription>
        </div>
        <div className="flex gap-1">
          {(["7d", "30d", "90d", "all"] as Period[]).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={period === p ? "default" : "outline"}
              onClick={() => setPeriod(p)}
            >
              {p}
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {loading ? (
          <div className="space-y-3">
            <div className="h-20 animate-pulse rounded-lg bg-muted" />
            <div className="h-32 animate-pulse rounded-lg bg-muted" />
            <div className="h-40 animate-pulse rounded-lg bg-muted" />
          </div>
        ) : error ? (
          <div className="flex h-32 items-center justify-center text-sm text-destructive">
            {error}
          </div>
        ) : !data || data.totalAnalyzed === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2 text-muted-foreground">
            <MessageSquare className="h-10 w-10 opacity-30" />
            <p className="text-sm">No engagement data yet.</p>
            <p className="text-xs">
              Publish posts and sync insights to measure engagement depth.
            </p>
          </div>
        ) : (
          <>
            {/* Summary metrics */}
            <div className="flex flex-wrap gap-4 rounded-lg border bg-muted/30 p-4">
              <div className="min-w-[110px]">
                <p className="text-xs text-muted-foreground">Avg Comment Rate</p>
                <p className="text-2xl font-bold">{data.avgCommentRate}%</p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MessageSquare className="h-3 w-3" /> per impression
                </p>
              </div>
              <div className="min-w-[110px]">
                <p className="text-xs text-muted-foreground">Avg Share Rate</p>
                <p className="text-2xl font-bold">{data.avgShareRate}%</p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Share2 className="h-3 w-3" /> per impression
                </p>
              </div>
              <div className="min-w-[110px]">
                <p className="text-xs text-muted-foreground">Depth Score</p>
                <p className="text-2xl font-bold">{data.avgEngagementDepthScore}</p>
                <p className="text-xs text-muted-foreground">/ 100 weighted</p>
              </div>
              <div className="min-w-[80px]">
                <p className="text-xs text-muted-foreground">Period</p>
                <p className="text-sm font-medium">{PERIOD_LABELS[period]}</p>
                <p className="text-xs text-muted-foreground">{data.totalAnalyzed} posts</p>
              </div>
            </div>

            {/* Per-platform breakdown */}
            {data.platformMetrics.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Platform Breakdown</p>
                <div className="overflow-hidden rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Platform</th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">Comment Rate</th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">Share Rate</th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">Posts</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data.platformMetrics.map((pm: PlatformDepthMetrics) => (
                        <tr key={pm.platform} className="hover:bg-muted/20">
                          <td className="px-3 py-2 font-medium">{pm.platform}</td>
                          <td className="px-3 py-2 text-right">
                            <span
                              className={
                                pm.avgCommentRate >= 1
                                  ? "text-green-600 dark:text-green-400"
                                  : pm.avgCommentRate >= 0.5
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-muted-foreground"
                              }
                            >
                              {pm.avgCommentRate}%
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span
                              className={
                                pm.avgShareRate >= 0.5
                                  ? "text-green-600 dark:text-green-400"
                                  : pm.avgShareRate >= 0.2
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-muted-foreground"
                              }
                            >
                              {pm.avgShareRate}%
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right text-muted-foreground">
                            {pm.postCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Top conversation-driving posts */}
            {data.topDeepEngagementPosts.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-muted-foreground">
                  Top Conversation-Driving Posts
                </p>
                {data.topDeepEngagementPosts.slice(0, 5).map((post: TopDeepPost) => (
                  <div
                    key={`${post.postId}-${post.platform}`}
                    className="flex flex-wrap items-start gap-3 rounded-lg border px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{post.content}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{post.platform}</p>
                    </div>
                    <DepthScoreBadge
                      score={Math.round(
                        (post.commentRate * 5 + post.shareRate * 4) / 9
                      )}
                    />
                    <div className="flex gap-3 text-right">
                      <div>
                        <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                          {post.commentRate}%
                        </p>
                        <p className="text-xs text-muted-foreground">comment rate</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                          {post.shareRate}%
                        </p>
                        <p className="text-xs text-muted-foreground">share rate</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold">
                          {post.impressions.toLocaleString()}
                        </p>
                        <p className="text-xs text-muted-foreground">impressions</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
