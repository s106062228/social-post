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
import { CalendarClock } from "lucide-react";
import type { SchedulingAnalyticsResponse } from "@/app/api/analytics/scheduling-analytics/route";

type Period = "30d" | "90d";

const PERIOD_LABELS: Record<Period, string> = {
  "30d": "30 days",
  "90d": "90 days",
};

const PLATFORM_LABELS: Record<string, string> = {
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  THREADS: "Threads",
  LINKEDIN: "LinkedIn",
  PINTEREST: "Pinterest",
  YOUTUBE: "YouTube",
  TIKTOK: "TikTok",
  TWITTER: "X (Twitter)",
  BLUESKY: "Bluesky",
  MASTODON: "Mastodon",
  TELEGRAM: "Telegram",
  REDDIT: "Reddit",
  NOSTR: "Nostr",
  TUMBLR: "Tumblr",
  WORDPRESS: "WordPress",
  MEDIUM: "Medium",
  GHOST: "Ghost",
  DEVTO: "Dev.to",
  GOOGLE_BUSINESS: "Google Business",
  HASHNODE: "Hashnode",
  BEEHIIV: "Beehiiv",
  PIXELFED: "Pixelfed",
  VIMEO: "Vimeo",
};

function formatHour(hour: number): string {
  if (hour === 0) return "12am";
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return "12pm";
  return `${hour - 12}pm`;
}

function OccupancyBar({ value }: { value: number }) {
  const color =
    value >= 70 ? "bg-green-500" : value >= 40 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">Calendar Occupancy</span>
        <span className="font-semibold">{value}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Percentage of days in period with at least one post
      </p>
    </div>
  );
}

function DayBarChart({ data }: { data: SchedulingAnalyticsResponse["dayDistribution"] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">Day of Week Distribution</p>
      <div className="flex items-end gap-1 h-16">
        {data.map((entry) => {
          const heightPct = Math.round((entry.count / max) * 100);
          return (
            <div
              key={entry.dayName}
              className="flex-1 flex flex-col items-center gap-0.5"
              title={`${entry.dayName}: ${entry.count}`}
            >
              <div className="w-full flex flex-col justify-end h-12">
                <div
                  className="w-full rounded-t bg-indigo-500 transition-all"
                  style={{ height: `${Math.max(heightPct, 2)}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground">{entry.dayName}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HourBarChart({ data }: { data: SchedulingAnalyticsResponse["hourDistribution"] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  // Only show every 3rd label to avoid crowding
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">Hour of Day Distribution (UTC)</p>
      <div className="flex items-end gap-0.5 h-16">
        {data.map((entry) => {
          const heightPct = Math.round((entry.count / max) * 100);
          return (
            <div
              key={entry.hour}
              className="flex-1 flex flex-col items-center"
              title={`${formatHour(entry.hour)}: ${entry.count}`}
            >
              <div className="w-full flex flex-col justify-end h-12">
                <div
                  className="w-full rounded-t bg-violet-400 transition-all"
                  style={{ height: `${Math.max(heightPct, 2)}%` }}
                />
              </div>
              {entry.hour % 6 === 0 && (
                <span className="text-[9px] text-muted-foreground mt-0.5">
                  {formatHour(entry.hour)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlatformBalanceTable({
  data,
}: {
  data: SchedulingAnalyticsResponse["platformBalance"];
}) {
  if (data.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No platform publish results yet.
      </p>
    );
  }
  const total = data.reduce((sum, p) => sum + p.count, 0);
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">Platform Balance</p>
      <div className="space-y-1">
        {data.map((entry) => {
          const pct = total > 0 ? Math.round((entry.count / total) * 100) : 0;
          const label = PLATFORM_LABELS[entry.platform] ?? entry.platform;
          return (
            <div key={entry.platform} className="flex items-center gap-2 text-xs">
              <span className="w-28 shrink-0 font-medium truncate">{label}</span>
              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-indigo-400"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-8 text-right text-muted-foreground">{entry.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SchedulingAnalyticsCard() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<SchedulingAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (p: Period) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics/scheduling-analytics?period=${p}`);
      if (res.ok) {
        const json = (await res.json()) as SchedulingAnalyticsResponse;
        setData(json);
      }
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(period);
  }, [fetchData, period]);

  const hasData = data && (data.totalScheduled + data.totalPublished) > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-indigo-500" />
            <CardTitle className="text-base">Scheduling Analytics</CardTitle>
          </div>
          <div className="flex gap-1">
            {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
              <Button
                key={p}
                variant={period === p ? "default" : "ghost"}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setPeriod(p)}
              >
                {PERIOD_LABELS[p]}
              </Button>
            ))}
          </div>
        </div>
        <CardDescription>
          Calendar usage patterns, timing, and scheduling behaviour
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-0">
        {loading ? (
          <div className="space-y-4 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-4 bg-muted rounded w-1/3" />
                <div className="h-10 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : !hasData ? (
          <div className="text-center py-8 space-y-2">
            <CalendarClock className="h-10 w-10 mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No scheduling data for this period yet.
            </p>
            <p className="text-xs text-muted-foreground">
              Schedule or publish posts to see your calendar analytics.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary stats row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-xl font-bold text-indigo-600">
                  {data.totalScheduled + data.totalPublished}
                </p>
                <p className="text-xs text-muted-foreground">Total Posts</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-xl font-bold text-green-600">
                  {data.avgPostsPerActiveDay}
                </p>
                <p className="text-xs text-muted-foreground">Posts / Active Day</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-xl font-bold text-violet-600">
                  {data.avgLeadTimeDays !== null ? `${data.avgLeadTimeDays}d` : "—"}
                </p>
                <p className="text-xs text-muted-foreground">Median Lead Time</p>
              </div>
            </div>

            {/* Calendar occupancy */}
            <OccupancyBar value={data.occupancyRate} />

            {/* Day of week distribution */}
            <DayBarChart data={data.dayDistribution} />

            {/* Hour distribution */}
            <HourBarChart data={data.hourDistribution} />

            {/* Platform balance */}
            <PlatformBalanceTable data={data.platformBalance} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
