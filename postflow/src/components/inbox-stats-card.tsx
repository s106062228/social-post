"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { MessageSquare, ChevronDown, ChevronUp, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface PlatformBreakdown {
  platform: string;
  total: number;
  unread: number;
  replied: number;
}

interface DailyVolume {
  date: string;
  count: number;
}

interface InboxStats {
  totalComments: number;
  unreadCount: number;
  repliedCount: number;
  autoRepliedCount: number;
  responseRate: number;
  platformBreakdown: PlatformBreakdown[];
  dailyVolume: DailyVolume[];
}

const PLATFORM_LABELS: Record<string, string> = {
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  TWITTER: "Twitter/X",
  THREADS: "Threads",
  LINKEDIN: "LinkedIn",
};

function formatShortDate(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00Z");
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

export function InboxStatsCard() {
  const [stats, setStats] = useState<InboxStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/inbox/stats");
      if (!res.ok) return;
      const data = (await res.json()) as InboxStats;
      setStats(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-4">
          <div className="h-12 animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  if (!stats || stats.totalComments === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            Inbox Analytics
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? (
              <ChevronUp className="h-3 w-3 mr-1" />
            ) : (
              <ChevronDown className="h-3 w-3 mr-1" />
            )}
            {expanded ? "Hide" : "Details"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-4">
        {/* KPI row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <p className="text-2xl font-bold">{stats.totalComments}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total Comments</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <p className="text-2xl font-bold text-amber-600">{stats.unreadCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Unread</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{stats.repliedCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Replied</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <p className="text-2xl font-bold text-primary">{stats.responseRate}%</p>
            <p className="text-xs text-muted-foreground mt-0.5">Response Rate</p>
          </div>
        </div>

        {stats.autoRepliedCount > 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Zap className="h-3.5 w-3.5 text-primary" />
            <span>
              <span className="font-medium text-foreground">{stats.autoRepliedCount}</span>{" "}
              auto-replies sent by rules
            </span>
          </div>
        )}

        {/* Expanded: sparkline + platform table */}
        {expanded && (
          <>
            {/* 30-day sparkline */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Comment Volume (Last 30 Days)
              </p>
              <div className="h-24">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={stats.dailyVolume}
                    margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                  >
                    <defs>
                      <linearGradient id="inboxGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatShortDate}
                      tick={{ fontSize: 10 }}
                      interval={6}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis hide allowDecimals={false} />
                    <Tooltip
                      formatter={(value: number) => [value, "Comments"]}
                      labelFormatter={(label: string) => formatShortDate(label as string)}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="hsl(var(--primary))"
                      strokeWidth={1.5}
                      fill="url(#inboxGrad)"
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Platform breakdown */}
            {stats.platformBreakdown.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  By Platform
                </p>
                <div className="space-y-1.5">
                  {stats.platformBreakdown.map((row) => (
                    <div
                      key={row.platform}
                      className="flex items-center justify-between text-sm"
                    >
                      <Badge variant="outline" className="text-xs">
                        {PLATFORM_LABELS[row.platform] ?? row.platform}
                      </Badge>
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        <span>
                          <span className="font-medium text-foreground">{row.total}</span> total
                        </span>
                        <span className={cn(row.unread > 0 && "text-amber-600")}>
                          {row.unread} unread
                        </span>
                        <span className={cn(row.replied > 0 && "text-green-600")}>
                          {row.replied} replied
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
