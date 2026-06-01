"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, Hash, Loader2, AlertCircle, Copy, PlusCircle } from "lucide-react";
import type { TrendingHashtagsResponse, TrendingHashtag } from "@/app/api/analytics/trending/route";
import { toast } from "@/hooks/use-toast";

type Period = "30d" | "60d" | "90d";

const PERIOD_LABELS: Record<Period, string> = {
  "30d": "Last 30 days",
  "60d": "Last 60 days",
  "90d": "Last 90 days",
};

function TrendIcon({ trend }: { trend: TrendingHashtag["trend"] }) {
  if (trend === "rising") return <TrendingUp className="h-4 w-4 text-green-500" />;
  if (trend === "falling") return <TrendingDown className="h-4 w-4 text-red-500" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

function TrendBadge({ trend }: { trend: TrendingHashtag["trend"] }) {
  if (trend === "rising") {
    return (
      <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0 text-xs">
        Rising
      </Badge>
    );
  }
  if (trend === "falling") {
    return (
      <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0 text-xs">
        Falling
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-xs">
      Stable
    </Badge>
  );
}

function VelocityBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, (score / 200) * 100));
  const color =
    score >= 120 ? "bg-green-500" : score >= 80 ? "bg-blue-500" : "bg-red-400";

  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground w-8 text-right">{score}</span>
    </div>
  );
}

export function TrendingHashtagsCard() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<TrendingHashtagsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/trending?period=${period}`);
      if (!res.ok) throw new Error("Failed to fetch trending hashtags");
      const json = (await res.json()) as TrendingHashtagsResponse;
      setData(json);
    } catch {
      setError("Could not load trending data");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  function copyHashtag(tag: string) {
    void navigator.clipboard.writeText(`#${tag}`);
    toast({ title: "Copied!", description: `#${tag} copied to clipboard` });
  }

  const rising = data?.hashtags.filter((h) => h.trend === "rising") ?? [];
  const stable = data?.hashtags.filter((h) => h.trend === "stable") ?? [];
  const falling = data?.hashtags.filter((h) => h.trend === "falling") ?? [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Hash className="h-5 w-5 text-primary" />
              Emerging Hashtag Trends
            </CardTitle>
            <CardDescription>
              Hashtags gaining or losing engagement momentum
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            {(["30d", "60d", "90d"] as Period[]).map((p) => (
              <Button
                key={p}
                variant={period === p ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setPeriod(p)}
                className="text-xs h-7"
              >
                {p}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-destructive py-6">
            <AlertCircle className="h-5 w-5" />
            <span className="text-sm">{error}</span>
          </div>
        ) : !data || data.hashtags.length === 0 ? (
          <div className="py-12 text-center">
            <Hash className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-sm text-muted-foreground font-medium">No hashtag data yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Publish posts with hashtags to see emerging trends
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary */}
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                <TrendingUp className="h-3.5 w-3.5" />
                {rising.length} rising
              </span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <Minus className="h-3.5 w-3.5" />
                {stable.length} stable
              </span>
              <span className="flex items-center gap-1 text-red-500">
                <TrendingDown className="h-3.5 w-3.5" />
                {falling.length} falling
              </span>
              <span className="ml-auto text-muted-foreground">
                {PERIOD_LABELS[period]}
              </span>
            </div>

            {/* Hashtag list */}
            <div className="space-y-2">
              {data.hashtags.map((item, idx) => (
                <div
                  key={item.hashtag}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors group"
                >
                  {/* Rank */}
                  <span className="text-xs text-muted-foreground w-5 text-right shrink-0">
                    {idx + 1}
                  </span>

                  {/* Trend icon */}
                  <TrendIcon trend={item.trend} />

                  {/* Hashtag name */}
                  <span className="font-mono text-sm font-medium text-primary min-w-0 truncate">
                    #{item.hashtag}
                  </span>

                  {/* Velocity bar */}
                  <VelocityBar score={item.velocityScore} />

                  {/* Trend badge */}
                  <TrendBadge trend={item.trend} />

                  {/* Post counts */}
                  <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                    {item.recentPostCount}r / {item.baselinePostCount}b posts
                  </span>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => copyHashtag(item.hashtag)}
                      title="Copy hashtag"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Link
                      href={`/posts/new?content=${encodeURIComponent(`#${item.hashtag} `)}`}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        title="Create post with this hashtag"
                      >
                        <PlusCircle className="h-3 w-3" />
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground border-t pt-3">
              <span>Velocity score: 100 = same as baseline, &gt;100 = improving, &lt;100 = declining</span>
              <span className="ml-auto">r = recent 7d, b = baseline</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
