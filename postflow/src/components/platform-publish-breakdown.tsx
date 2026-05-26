"use client";

import { BarChart2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface PlatformStat {
  platform: string;
  publishedCount: number;
}

interface PlatformPublishBreakdownProps {
  breakdown: PlatformStat[];
}

const PLATFORM_BAR_COLORS: Record<string, string> = {
  FACEBOOK: "bg-blue-500",
  INSTAGRAM: "bg-pink-500",
  THREADS: "bg-gray-500",
  TWITTER: "bg-sky-500",
  LINKEDIN: "bg-blue-700",
  YOUTUBE: "bg-red-500",
  TIKTOK: "bg-slate-700",
  REDDIT: "bg-orange-500",
  BLUESKY: "bg-cyan-500",
  MASTODON: "bg-purple-500",
  TELEGRAM: "bg-teal-500",
  NOSTR: "bg-yellow-500",
  TUMBLR: "bg-indigo-500",
  WORDPRESS: "bg-blue-400",
  MEDIUM: "bg-green-600",
  GHOST: "bg-yellow-600",
  DEVTO: "bg-gray-700",
  GOOGLE_BUSINESS: "bg-green-600",
  HASHNODE: "bg-blue-600",
  PINTEREST: "bg-red-600",
  BEEHIIV: "bg-orange-500",
};

export function PlatformPublishBreakdown({ breakdown }: PlatformPublishBreakdownProps) {
  const maxCount = breakdown.length > 0 ? breakdown[0].publishedCount : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart2 className="h-4 w-4" />
          Platform Breakdown
        </CardTitle>
        <CardDescription>Published posts by platform (last 30 days)</CardDescription>
      </CardHeader>
      <CardContent>
        {breakdown.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <BarChart2 className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No published posts yet</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {breakdown.map(({ platform, publishedCount }) => {
              const pct = maxCount > 0 ? (publishedCount / maxCount) * 100 : 0;
              const label = platform.charAt(0) + platform.slice(1).toLowerCase();
              const barColor = PLATFORM_BAR_COLORS[platform] ?? "bg-gray-400";
              return (
                <div key={platform} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs font-medium text-muted-foreground truncate">
                    {label}
                  </span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${barColor}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {publishedCount}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
