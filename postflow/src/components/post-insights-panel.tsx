"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, BarChart2, RefreshCw, Eye, Heart, MessageCircle, Share2, Radio } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface PlatformInsights {
  platform: string;
  publishResultId: string;
  platformPostId: string | null;
  publishedUrl: string | null;
  publishedAt: string | null;
  insights: {
    impressions: number | null;
    reach: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    syncedAt: string;
  } | null;
}

interface InsightsTotals {
  impressions: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
}

interface InsightsResponse {
  perPlatform: PlatformInsights[];
  totals: InsightsTotals;
}

interface PostInsightsPanelProps {
  postId: string;
}

const platformLabels: Record<string, string> = {
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  THREADS: "Threads",
};

function MetricPill({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | null;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-[52px]">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-sm font-semibold leading-none">
        {value !== null ? value.toLocaleString() : "—"}
      </span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

export function PostInsightsPanel({ postId }: PostInsightsPanelProps) {
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchInsights = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/posts/${postId}/insights`);
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to load insights");
      }
      const json = (await res.json()) as InsightsResponse;
      setData(json);
    } catch (err) {
      toast({
        title: "Failed to load insights",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    void fetchInsights();
  }, [fetchInsights]);

  async function syncInsights() {
    setSyncing(true);
    try {
      const res = await fetch(`/api/posts/${postId}/insights`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Sync failed");
      }
      const result = (await res.json()) as { synced: number; skipped: number };
      toast({
        title: "Insights synced",
        description: `${result.synced} platform${result.synced !== 1 ? "s" : ""} updated.`,
        variant: "success",
      });
      await fetchInsights();
    } catch (err) {
      toast({
        title: "Sync failed",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Engagement Insights</CardTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void syncInsights()}
            disabled={syncing || loading}
            className="h-7 text-xs"
          >
            {syncing ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <RefreshCw className="h-3 w-3 mr-1" />
            )}
            Sync Now
          </Button>
        </div>
        <CardDescription className="text-xs">
          Engagement metrics fetched from each connected platform.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !data || data.perPlatform.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No published results yet. Insights will appear once the post is published.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Aggregate totals */}
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-3">All Platforms</p>
              <div className="flex flex-wrap gap-4 justify-around">
                <MetricPill icon={Eye} label="Impressions" value={data.totals.impressions} />
                <MetricPill icon={Radio} label="Reach" value={data.totals.reach} />
                <MetricPill icon={Heart} label="Likes" value={data.totals.likes} />
                <MetricPill icon={MessageCircle} label="Comments" value={data.totals.comments} />
                <MetricPill icon={Share2} label="Shares" value={data.totals.shares} />
              </div>
            </div>

            {/* Per-platform breakdown */}
            <div className="flex flex-col gap-2">
              {data.perPlatform.map((item) => (
                <div
                  key={item.publishResultId}
                  className="rounded-md border p-3 flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs font-medium">
                      {platformLabels[item.platform] ?? item.platform}
                    </Badge>
                    {item.insights && (
                      <span className="text-[10px] text-muted-foreground">
                        Synced{" "}
                        {new Date(item.insights.syncedAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>

                  {item.insights ? (
                    <div className="flex flex-wrap gap-3 justify-around">
                      <MetricPill icon={Eye} label="Impressions" value={item.insights.impressions} />
                      <MetricPill icon={Radio} label="Reach" value={item.insights.reach} />
                      <MetricPill icon={Heart} label="Likes" value={item.insights.likes} />
                      <MetricPill icon={MessageCircle} label="Comments" value={item.insights.comments} />
                      <MetricPill icon={Share2} label="Shares" value={item.insights.shares} />
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-1">
                      No insights yet — click &ldquo;Sync Now&rdquo; to fetch.
                    </p>
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
