"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  Hash,
  Handshake,
  Megaphone,
  Trophy,
  TrendingUp,
} from "lucide-react";
import type {
  CampaignComparisonItem,
  CampaignComparisonResponse,
  CampaignType,
} from "@/app/api/analytics/campaign-comparison/route";

type Period = "30d" | "90d" | "all";
type FilterType = "all" | CampaignType;

const PERIOD_LABELS: Record<Period, string> = {
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
};

const TYPE_ICONS: Record<CampaignType, React.ReactNode> = {
  content: <Megaphone className="h-3.5 w-3.5" />,
  hashtag: <Hash className="h-3.5 w-3.5" />,
  collaboration: <Handshake className="h-3.5 w-3.5" />,
};

const TYPE_LABELS: Record<CampaignType, string> = {
  content: "Content",
  hashtag: "Hashtag",
  collaboration: "Collab",
};

const TYPE_COLOURS: Record<CampaignType, string> = {
  content: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300",
  hashtag: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300",
  collaboration:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300",
};

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function CampaignRow({
  item,
  isTop,
}: {
  item: CampaignComparisonItem;
  isTop: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border p-3 hover:bg-muted/30 transition-colors">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          {isTop && (
            <Trophy className="h-4 w-4 text-amber-500 shrink-0" />
          )}
          <span className="text-sm font-medium truncate">{item.name}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${TYPE_COLOURS[item.type]}`}
          >
            {TYPE_ICONS[item.type]}
            {TYPE_LABELS[item.type]}
          </span>
          {!item.isActive && (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              Inactive
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        <div className="flex flex-col">
          <span className="text-muted-foreground">Posts</span>
          <span className="font-semibold tabular-nums">{item.postCount}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-muted-foreground">Engagement</span>
          <span className="font-semibold tabular-nums">{fmt(item.engagement)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-muted-foreground">Reach</span>
          <span className="font-semibold tabular-nums">{fmt(item.reach)}</span>
        </div>
        <div className="flex flex-col">
          {item.costPerEngagement != null ? (
            <>
              <span className="text-muted-foreground">Cost/Eng.</span>
              <span className="font-semibold tabular-nums">
                ${item.costPerEngagement.toFixed(2)}
              </span>
            </>
          ) : (
            <>
              <span className="text-muted-foreground">Avg/Post</span>
              <span className="font-semibold tabular-nums">{fmt(item.avgEngagement)}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function CampaignComparisonCard() {
  const [period, setPeriod] = useState<Period>("30d");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [data, setData] = useState<CampaignComparisonResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (p: Period) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/campaign-comparison?period=${p}`);
      if (!res.ok) throw new Error("Failed to load");
      const json = (await res.json()) as CampaignComparisonResponse;
      setData(json);
    } catch {
      setError("Failed to load campaign data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(period);
  }, [fetchData, period]);

  const filtered =
    data?.campaigns.filter((c) => filterType === "all" || c.type === filterType) ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Campaign Performance Comparison
          </CardTitle>
          <CardDescription>
            Engagement across content campaigns, hashtag campaigns, and collaborations
          </CardDescription>
        </div>

        <div className="flex flex-wrap gap-2">
          {(["30d", "90d", "all"] as Period[]).map((p) => (
            <Button
              key={p}
              variant={period === p ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setPeriod(p)}
            >
              {PERIOD_LABELS[p]}
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Summary row */}
        {data && !loading && (
          <div className="grid grid-cols-3 gap-3 rounded-lg bg-muted/30 p-3">
            <div className="flex flex-col items-center text-center">
              <span className="text-lg font-bold">{data.totalCampaigns}</span>
              <span className="text-xs text-muted-foreground">Campaigns</span>
            </div>
            <div className="flex flex-col items-center text-center">
              <span className="text-lg font-bold">{data.totalPosts}</span>
              <span className="text-xs text-muted-foreground">Total Posts</span>
            </div>
            <div className="flex flex-col items-center text-center">
              <span className="text-lg font-bold">{fmt(data.totalEngagement)}</span>
              <span className="text-xs text-muted-foreground">Total Engagement</span>
            </div>
          </div>
        )}

        {/* Type filter tabs */}
        <div className="flex gap-1.5 flex-wrap">
          {(["all", "content", "hashtag", "collaboration"] as FilterType[]).map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                filterType === t
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {t === "all" ? (
                "All"
              ) : (
                <>
                  {TYPE_ICONS[t]}
                  {TYPE_LABELS[t]}
                </>
              )}
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <p className="py-6 text-center text-sm text-red-500">{error}</p>
        )}

        {/* Empty */}
        {!loading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <TrendingUp className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {data?.totalCampaigns === 0
                ? "No campaigns found. Create campaigns, hashtag campaigns, or collaborations to see comparisons."
                : "No campaigns match the selected filter."}
            </p>
          </div>
        )}

        {/* Campaign rows */}
        {!loading && !error && filtered.length > 0 && (
          <div className="space-y-2">
            {filtered.map((item, idx) => (
              <CampaignRow
                key={`${item.type}-${item.id}`}
                item={item}
                isTop={idx === 0 && filterType === "all"}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
