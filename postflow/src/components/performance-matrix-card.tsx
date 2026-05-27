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
import { Grid3X3 } from "lucide-react";
import type { MatrixCell, PerformanceMatrixResponse } from "@/app/api/analytics/performance-matrix/route";

type Period = "30d" | "90d" | "all";

const PERIOD_LABELS: Record<Period, string> = {
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "all": "All time",
};

const CATEGORY_LABELS: Record<string, string> = {
  EDUCATIONAL: "Educational",
  PROMOTIONAL: "Promotional",
  ENTERTAINING: "Entertaining",
  ENGAGING: "Engaging",
  INSPIRING: "Inspiring",
  NEWS: "News",
  BEHIND_THE_SCENES: "Behind the Scenes",
  USER_GENERATED: "User Generated",
  UNCATEGORIZED: "Uncategorized",
};

function categoryLabel(key: string): string {
  return CATEGORY_LABELS[key] ?? key;
}

function platformLabel(platform: string): string {
  const LABELS: Record<string, string> = {
    FACEBOOK: "Facebook",
    INSTAGRAM: "Instagram",
    THREADS: "Threads",
    TWITTER: "Twitter/X",
    LINKEDIN: "LinkedIn",
    TIKTOK: "TikTok",
    YOUTUBE: "YouTube",
    REDDIT: "Reddit",
    PINTEREST: "Pinterest",
    BLUESKY: "Bluesky",
    MASTODON: "Mastodon",
    TELEGRAM: "Telegram",
    NOSTR: "Nostr",
    TUMBLR: "Tumblr",
    WORDPRESS: "WordPress",
    MEDIUM: "Medium",
    GHOST: "Ghost",
    DEVTO: "Dev.to",
    HASHNODE: "Hashnode",
    VIMEO: "Vimeo",
    PIXELFED: "Pixelfed",
    BEEHIIV: "Beehiiv",
    GOOGLE_BUSINESS: "Google Business",
  };
  return LABELS[platform] ?? platform;
}

// Map a 0..maxValue engagement score to a CSS background color class
function engagementColorStyle(value: number, maxValue: number): string {
  if (maxValue === 0 || value === 0) return "bg-muted text-muted-foreground";
  const ratio = value / maxValue;
  if (ratio >= 0.8) return "bg-green-600 text-white";
  if (ratio >= 0.6) return "bg-green-500 text-white";
  if (ratio >= 0.4) return "bg-green-400 text-white";
  if (ratio >= 0.2) return "bg-green-200 text-green-900";
  return "bg-green-100 text-green-800";
}

export function PerformanceMatrixCard() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<PerformanceMatrixResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (p: Period) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/performance-matrix?period=${p}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json = (await res.json()) as PerformanceMatrixResponse;
      setData(json);
    } catch {
      setError("Failed to load performance matrix");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(period);
  }, [period, fetchData]);

  // Build lookup for quick cell access: `${platform}:${category}`
  const cellMap = new Map<string, MatrixCell>();
  if (data) {
    for (const cell of data.matrix) {
      cellMap.set(`${cell.platform}:${cell.category}`, cell);
    }
  }

  const maxEngagement = data
    ? Math.max(0, ...data.matrix.map((c) => c.avgEngagement))
    : 0;

  const isEmpty = data && (data.platforms.length === 0 || data.categories.length === 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Grid3X3 className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-base">Content Category × Platform Matrix</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Average engagement by content category and platform
              </CardDescription>
            </div>
          </div>
          <div className="flex gap-1">
            {(["30d", "90d", "all"] as Period[]).map((p) => (
              <Button
                key={p}
                size="sm"
                variant={period === p ? "default" : "outline"}
                className="h-7 text-xs px-2"
                onClick={() => setPeriod(p)}
              >
                {PERIOD_LABELS[p]}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-2">
                <div className="h-8 w-32 animate-pulse rounded bg-muted" />
                {Array.from({ length: 3 }).map((__, j) => (
                  <div key={j} className="h-8 flex-1 animate-pulse rounded bg-muted" />
                ))}
              </div>
            ))}
          </div>
        )}

        {!loading && error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {!loading && isEmpty && (
          <div className="py-8 text-center text-muted-foreground">
            <Grid3X3 className="mx-auto mb-2 h-8 w-8 opacity-40" />
            <p className="text-sm">No published posts with category data yet.</p>
            <p className="text-xs mt-1">
              Assign content categories to posts and sync engagement insights to see the matrix.
            </p>
          </div>
        )}

        {!loading && !error && data && !isEmpty && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  {/* Empty corner */}
                  <th className="p-1 text-left font-medium text-muted-foreground w-32 min-w-[8rem]">
                    Category ↓ / Platform →
                  </th>
                  {data.platforms.map((platform) => (
                    <th
                      key={platform}
                      className="p-1 text-center font-medium text-muted-foreground min-w-[80px]"
                    >
                      {platformLabel(platform)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.categories.map((category) => (
                  <tr key={category} className="border-t border-border/50">
                    <td className="p-1 font-medium text-foreground">
                      {categoryLabel(category)}
                    </td>
                    {data.platforms.map((platform) => {
                      const cell = cellMap.get(`${platform}:${category}`);
                      return (
                        <td key={platform} className="p-1 text-center">
                          {cell ? (
                            <div
                              className={`rounded px-1.5 py-1 ${engagementColorStyle(
                                cell.avgEngagement,
                                maxEngagement
                              )}`}
                              title={`${cell.postCount} post${cell.postCount !== 1 ? "s" : ""} · avg engagement ${cell.avgEngagement}`}
                            >
                              <div className="font-semibold">{cell.avgEngagement}</div>
                              <div className="text-[10px] opacity-80">
                                {cell.postCount}p
                              </div>
                            </div>
                          ) : (
                            <div className="rounded px-1.5 py-1 bg-muted text-muted-foreground opacity-40">
                              —
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Legend */}
            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <span>Engagement intensity:</span>
              <div className="flex gap-1">
                {[
                  { label: "Low", cls: "bg-green-100" },
                  { label: "", cls: "bg-green-200" },
                  { label: "", cls: "bg-green-400" },
                  { label: "", cls: "bg-green-500" },
                  { label: "High", cls: "bg-green-600" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-0.5">
                    <div className={`h-3 w-5 rounded ${item.cls}`} />
                    {item.label && <span>{item.label}</span>}
                  </div>
                ))}
              </div>
              <span className="ml-2">· Number = avg engagement (likes+comments+shares) · "p" = post count</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
