"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Megaphone, TrendingUp, Wallet } from "lucide-react";
import { formatCurrency } from "@/lib/promotion-roi";
import type {
  PromotionRoiResponse,
  PlatformPromotionRoi,
} from "@/app/api/analytics/promotion-roi/route";

type Period = "30d" | "90d" | "all";

const PERIOD_LABELS: Record<Period, string> = {
  "30d": "30 Days",
  "90d": "90 Days",
  all: "All Time",
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
  HASHNODE: "Hashnode",
  PIXELFED: "Pixelfed",
  VIMEO: "Vimeo",
  BEEHIIV: "Beehiiv",
  GOOGLE_BUSINESS: "Google Business",
};

function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] ?? platform;
}

function utilizationBarColor(pct: number): string {
  if (pct > 100) return "bg-red-500";
  if (pct >= 80) return "bg-green-500";
  if (pct >= 40) return "bg-yellow-500";
  return "bg-blue-500";
}

function utilizationTextColor(pct: number): string {
  if (pct > 100) return "text-red-600 dark:text-red-400";
  if (pct >= 80) return "text-green-600 dark:text-green-400";
  if (pct >= 40) return "text-yellow-600 dark:text-yellow-400";
  return "text-blue-600 dark:text-blue-400";
}

function MetricChip({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col items-center rounded-md border border-border bg-muted/40 px-2 py-1.5 min-w-[72px]">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold">{value ?? "—"}</span>
    </div>
  );
}

function PlatformRow({ data }: { data: PlatformPromotionRoi }) {
  const pct = Math.min(data.budgetUtilization, 999);
  const barWidth = Math.min(data.budgetUtilization, 100);

  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="font-medium">{platformLabel(data.platform)}</span>
          <Badge variant="outline" className="text-xs">
            {data.promotionCount} {data.promotionCount === 1 ? "promotion" : "promotions"}
          </Badge>
        </div>
        <span className={`text-sm font-semibold ${utilizationTextColor(pct)}`}>
          {pct.toFixed(0)}% of budget used
        </span>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
        <span>Spend: {formatCurrency(data.totalSpend)}</span>
        <span>Budget: {formatCurrency(data.totalBudget)}</span>
      </div>

      <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${utilizationBarColor(pct)}`}
          style={{ width: `${barWidth}%` }}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <MetricChip label="CPM" value={data.avgCpm !== null ? formatCurrency(data.avgCpm) : null} />
        <MetricChip label="CPC" value={data.avgCpc !== null ? formatCurrency(data.avgCpc) : null} />
        <MetricChip label="CPA" value={data.avgCpa !== null ? formatCurrency(data.avgCpa) : null} />
        <MetricChip label="CTR" value={data.avgCtr !== null ? `${data.avgCtr.toFixed(2)}%` : null} />
        <MetricChip label="Impressions" value={data.totalImpressions.toLocaleString()} />
        <MetricChip label="Clicks" value={data.totalClicks.toLocaleString()} />
        <MetricChip label="Conversions" value={data.totalConversions.toLocaleString()} />
      </div>
    </div>
  );
}

export function PromotionRoiCard() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<PromotionRoiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async (p: Period) => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/analytics/promotion-roi?period=${p}`);
      if (!res.ok) throw new Error("Failed to load promotion ROI");
      const json = (await res.json()) as PromotionRoiResponse;
      setData(json);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(period);
  }, [period, fetchData]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-2">
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Paid Promotion ROI</CardTitle>
        </div>
        <div className="flex gap-1">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={period === p ? "default" : "ghost"}
              onClick={() => setPeriod(p)}
            >
              {PERIOD_LABELS[p]}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 rounded-md bg-muted" />
            ))}
          </div>
        ) : error || !data ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
            <Megaphone className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">Couldn&apos;t load promotion ROI data.</p>
          </div>
        ) : data.platforms.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
            <Megaphone className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">No paid promotions tracked yet.</p>
            <p className="text-xs mt-1">Add a promotion to start tracking ad spend ROI.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              <div className="rounded-lg border border-border p-3 flex flex-col items-center text-center">
                <Wallet className="h-4 w-4 text-muted-foreground mb-1" />
                <span className="text-xs text-muted-foreground">Total Budget</span>
                <span className="text-base font-semibold">{formatCurrency(data.totalBudget)}</span>
              </div>
              <div className="rounded-lg border border-border p-3 flex flex-col items-center text-center">
                <TrendingUp className="h-4 w-4 text-muted-foreground mb-1" />
                <span className="text-xs text-muted-foreground">Total Spend</span>
                <span className="text-base font-semibold">{formatCurrency(data.totalSpend)}</span>
              </div>
              <div className="rounded-lg border border-border p-3 flex flex-col items-center text-center">
                <span className="text-xs text-muted-foreground">Promotions</span>
                <span className="text-base font-semibold">{data.totalPromotions}</span>
              </div>
              <div className="rounded-lg border border-border p-3 flex flex-col items-center text-center">
                <span className="text-xs text-muted-foreground">Active</span>
                <span className="text-base font-semibold">{data.activePromotions}</span>
              </div>
            </div>

            <div className="divide-y divide-border">
              {data.platforms.map((p) => (
                <PlatformRow key={p.platform} data={p} />
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
