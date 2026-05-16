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
import { Hash, Copy, Check } from "lucide-react";
import type { HashtagAnalyticsResponse } from "@/app/api/analytics/hashtags/route";
import type { HashtagStat } from "@/lib/hashtag-analytics";

type Period = "7d" | "30d" | "90d";

const PERIOD_LABELS: Record<Period, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(`#${text}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={handleCopy}
      className="ml-1 text-muted-foreground hover:text-foreground transition-colors"
      title={`Copy #${text}`}
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </button>
  );
}

function HashtagRow({
  stat,
  maxEngagement,
  rank,
}: {
  stat: HashtagStat;
  maxEngagement: number;
  rank: number;
}) {
  return (
    <div className="flex items-center gap-3 py-2 border-b last:border-b-0">
      <span className="w-5 text-right text-xs text-muted-foreground shrink-0">
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 mb-1">
          <span className="font-medium text-sm truncate">#{stat.hashtag}</span>
          <CopyButton text={stat.hashtag} />
          <Badge variant="secondary" className="ml-auto text-xs shrink-0">
            {stat.postCount} post{stat.postCount !== 1 ? "s" : ""}
          </Badge>
        </div>
        <EngagementBar value={stat.avgEngagement} max={maxEngagement} />
        <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
          <span title="Likes">❤️ {stat.totalLikes}</span>
          <span title="Comments">💬 {stat.totalComments}</span>
          <span title="Shares">↗️ {stat.totalShares}</span>
          <span title="Reach">👁️ {stat.totalReach}</span>
          <span className="ml-auto font-medium text-foreground">
            {Math.round(stat.avgEngagement)} avg score
          </span>
        </div>
      </div>
    </div>
  );
}

export function HashtagPerformanceCard() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<HashtagAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (p: Period) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/hashtags?period=${p}`);
      if (!res.ok) throw new Error("Failed to fetch hashtag analytics");
      const json = (await res.json()) as HashtagAnalyticsResponse;
      setData(json);
    } catch {
      setError("Failed to load hashtag data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(period);
  }, [period, fetchData]);

  const maxEngagement =
    data?.hashtags.length
      ? Math.max(...data.hashtags.map((h) => h.avgEngagement))
      : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Hashtag Performance</CardTitle>
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
          Top hashtags ranked by average engagement score ({PERIOD_LABELS[period]})
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

        {!loading && !error && (!data || data.hashtags.length === 0) && (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Hash className="h-8 w-8 opacity-40" />
            <p className="text-sm">No hashtag data for this period yet.</p>
            <p className="text-xs text-center max-w-xs">
              Use hashtags in your published posts and sync insights to see performance.
            </p>
          </div>
        )}

        {!loading && !error && data && data.hashtags.length > 0 && (
          <>
            <div>
              {data.hashtags.slice(0, 15).map((stat, idx) => (
                <HashtagRow
                  key={stat.hashtag}
                  stat={stat}
                  maxEngagement={maxEngagement}
                  rank={idx + 1}
                />
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
