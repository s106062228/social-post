"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Eye,
  Heart,
  MessageCircle,
  Share2,
  TrendingUp,
  Trophy,
} from "lucide-react";

interface Milestone {
  id: string;
  metric: string;
  threshold: number;
  achievedAt: string;
  celebrated: boolean;
  post: { id: string; content: string };
}

const METRIC_ICONS: Record<string, React.ReactNode> = {
  impressions: <Eye className="h-4 w-4" />,
  reach: <TrendingUp className="h-4 w-4" />,
  likes: <Heart className="h-4 w-4" />,
  comments: <MessageCircle className="h-4 w-4" />,
  shares: <Share2 className="h-4 w-4" />,
};

const METRIC_COLORS: Record<string, string> = {
  impressions: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  reach:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  likes:
    "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300",
  comments:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  shares:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
};

function formatThreshold(n: number): string {
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function EngagementMilestonesCard() {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [period, setPeriod] = useState("30d");
  const [loading, setLoading] = useState(true);
  const [celebrating, setCelebrating] = useState<Set<string>>(new Set());

  const fetchMilestones = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/analytics/engagement-milestones?period=${period}`
      );
      if (!res.ok) throw new Error("Failed");
      const data = (await res.json()) as { milestones: Milestone[] };
      setMilestones(data.milestones ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void fetchMilestones();
  }, [fetchMilestones]);

  async function celebrate(id: string) {
    setCelebrating((prev) => new Set(prev).add(id));
    try {
      await fetch(`/api/analytics/engagement-milestones/${id}/celebrate`, {
        method: "POST",
      });
      setMilestones((prev) =>
        prev.map((m) => (m.id === id ? { ...m, celebrated: true } : m))
      );
    } finally {
      setCelebrating((prev) => {
        const s = new Set(prev);
        s.delete(id);
        return s;
      });
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Trophy className="h-5 w-5 text-yellow-500" />
          Engagement Milestones
        </CardTitle>
        <div className="flex gap-1">
          {(["7d", "30d", "90d"] as const).map((p) => (
            <Button
              key={p}
              variant={period === p ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setPeriod(p)}
            >
              {p}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 rounded-md bg-muted animate-pulse" />
            ))}
          </div>
        ) : milestones.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Trophy className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
            <p>No milestones reached yet in this period.</p>
            <p className="mt-1 text-xs">
              Keep publishing and watch the numbers grow!
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {milestones.map((m) => (
              <div
                key={m.id}
                className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                  m.celebrated
                    ? "border-muted bg-muted/20"
                    : "border-border bg-card"
                }`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    METRIC_COLORS[m.metric] ??
                    "bg-gray-100 text-gray-800"
                  }`}
                >
                  {METRIC_ICONS[m.metric] ?? (
                    <Trophy className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-tight">
                    <span className="font-bold">
                      {formatThreshold(m.threshold)}
                    </span>{" "}
                    {m.metric}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {m.post.content.slice(0, 50)}
                    {m.post.content.length > 50 ? "…" : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-xs text-muted-foreground">
                    {formatDate(m.achievedAt)}
                  </span>
                  {!m.celebrated && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-xs"
                      disabled={celebrating.has(m.id)}
                      onClick={() => void celebrate(m.id)}
                    >
                      🎉
                    </Button>
                  )}
                  {m.celebrated && (
                    <Badge variant="secondary" className="text-xs">
                      ✓ Celebrated
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
