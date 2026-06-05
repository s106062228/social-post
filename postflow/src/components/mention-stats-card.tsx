"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AtSign, Loader2 } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface MentionStats {
  total: number;
  bySentiment: { positive: number; neutral: number; negative: number };
  byPlatform: { platform: string; count: number }[];
  byResponseStatus: { none: number; acknowledged: number; replied: number; ignored: number };
  recentVolume: { date: string; count: number }[];
}

export function MentionStatsCard() {
  const [stats, setStats] = useState<MentionStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/brand-mentions/stats")
      .then((r) => r.json())
      .then((data: MentionStats) => setStats(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AtSign className="h-4 w-4" /> Brand Mention Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!stats || stats.total === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AtSign className="h-4 w-4" /> Brand Mention Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No mentions yet. Add your first brand mention below.
        </CardContent>
      </Card>
    );
  }

  const sentimentData = [
    { name: "Positive", value: stats.bySentiment.positive, color: "#22c55e" },
    { name: "Neutral", value: stats.bySentiment.neutral, color: "#94a3b8" },
    { name: "Negative", value: stats.bySentiment.negative, color: "#ef4444" },
  ].filter((d) => d.value > 0);

  const replied = stats.byResponseStatus.replied;
  const responseRate = stats.total > 0 ? Math.round((replied / stats.total) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AtSign className="h-4 w-4" /> Brand Mention Overview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary counts */}
        <div className="flex gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{stats.bySentiment.positive}</div>
            <div className="text-xs text-muted-foreground">Positive</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-500">{stats.bySentiment.negative}</div>
            <div className="text-xs text-muted-foreground">Negative</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{responseRate}%</div>
            <div className="text-xs text-muted-foreground">Replied</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Sentiment donut */}
          {sentimentData.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Sentiment</p>
              <ResponsiveContainer width="100%" height={120}>
                <PieChart>
                  <Pie
                    data={sentimentData}
                    cx="50%"
                    cy="50%"
                    innerRadius={30}
                    outerRadius={50}
                    dataKey="value"
                  >
                    {sentimentData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v, n) => [v, n]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-1 justify-center">
                {sentimentData.map((d) => (
                  <Badge key={d.name} variant="outline" className="text-xs">
                    <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: d.color }} />
                    {d.name}: {d.value}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* 30-day volume sparkline */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Last 30 Days</p>
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={stats.recentVolume}>
                <XAxis dataKey="date" hide />
                <YAxis hide />
                <Tooltip
                  labelFormatter={(l: string) => l}
                  formatter={(v: number) => [v, "Mentions"]}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#6366f1"
                  fill="#6366f1"
                  fillOpacity={0.15}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Response status */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Response Status</p>
          <div className="flex flex-wrap gap-1">
            {Object.entries(stats.byResponseStatus).map(([status, count]) =>
              count > 0 ? (
                <Badge key={status} variant="secondary" className="text-xs capitalize">
                  {status}: {count}
                </Badge>
              ) : null
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
