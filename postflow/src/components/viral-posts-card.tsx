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
import { Flame, TrendingUp, Minus, Loader2, AlertCircle } from "lucide-react";
import type {
  ViralPostsResponse,
  PostVelocityData,
} from "@/app/api/analytics/viral-posts/route";

type Period = "24h" | "48h" | "7d";

const PERIOD_LABELS: Record<Period, string> = {
  "24h": "Last 24 hours",
  "48h": "Last 48 hours",
  "7d": "Last 7 days",
};

function ViralStatusBadge({
  status,
}: {
  status: PostVelocityData["viralStatus"];
}) {
  if (status === "viral") {
    return (
      <Badge className="bg-red-500 text-white gap-1">
        <Flame className="h-3 w-3" /> Viral
      </Badge>
    );
  }
  if (status === "trending") {
    return (
      <Badge className="bg-orange-400 text-white gap-1">
        <TrendingUp className="h-3 w-3" /> Trending
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <Minus className="h-3 w-3" /> Normal
    </Badge>
  );
}

export function ViralPostsCard() {
  const [period, setPeriod] = useState<Period>("7d");
  const [data, setData] = useState<ViralPostsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (p: Period) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/viral-posts?period=${p}&limit=10`);
      if (!res.ok) throw new Error("Failed to load viral posts");
      const json: ViralPostsResponse = await res.json();
      setData(json);
    } catch {
      setError("Failed to load viral post data.");
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
      <CardHeader className="flex flex-row items-start justify-between gap-2 flex-wrap">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-red-500" />
            Viral Post Detection
          </CardTitle>
          <CardDescription>
            Posts ranked by engagement velocity (score / hour since publishing)
          </CardDescription>
        </div>
        <div className="flex gap-1 flex-wrap">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={period === p ? "default" : "outline"}
              onClick={() => handlePeriod(p)}
            >
              {p}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && error && (
          <div className="flex items-center gap-2 text-destructive py-6 justify-center">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {!loading && !error && data && (
          <>
            {data.posts.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                <Flame className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>No published posts with engagement data found.</p>
                <p className="mt-1">Sync post insights to see velocity data.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-xs text-muted-foreground mb-4">
                  Avg velocity: {data.avgVelocity.toFixed(2)} pts/hr &middot;{" "}
                  {data.totalPosts} post{data.totalPosts !== 1 ? "s" : ""}{" "}
                  analysed in {PERIOD_LABELS[period].toLowerCase()}
                </div>
                {data.posts.map((post) => (
                  <div
                    key={`${post.postId}-${post.platform}`}
                    className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <ViralStatusBadge status={post.viralStatus} />
                        <Badge variant="outline" className="text-xs">
                          {post.platform}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {post.velocityPerHour.toFixed(2)} pts/hr
                        </span>
                      </div>
                      <p className="text-sm text-foreground line-clamp-2">
                        {post.content}
                      </p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>❤️ {post.metrics.likes}</span>
                        <span>💬 {post.metrics.comments}</span>
                        <span>🔁 {post.metrics.shares}</span>
                        <span>👁 {post.metrics.reach}</span>
                        <span>
                          {post.hoursSincePublished.toFixed(1)}h ago
                        </span>
                      </div>
                    </div>
                    <Link
                      href={`/posts`}
                      className="shrink-0 text-xs text-primary hover:underline"
                    >
                      View
                    </Link>
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
