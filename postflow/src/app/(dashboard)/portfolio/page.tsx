"use client";

import { useEffect, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Users,
  BarChart3,
  Activity,
  Globe,
  Minus,
} from "lucide-react";
import type { PortfolioResponse } from "@/app/api/analytics/portfolio/route";

const PLATFORM_COLORS: Record<string, string> = {
  FACEBOOK: "bg-blue-500",
  INSTAGRAM: "bg-pink-500",
  THREADS: "bg-gray-800",
  TWITTER: "bg-sky-500",
  LINKEDIN: "bg-blue-700",
  TIKTOK: "bg-black",
  YOUTUBE: "bg-red-600",
  PINTEREST: "bg-red-500",
  REDDIT: "bg-orange-600",
  BLUESKY: "bg-blue-400",
  MASTODON: "bg-purple-600",
  TELEGRAM: "bg-sky-600",
  TUMBLR: "bg-indigo-600",
  WORDPRESS: "bg-blue-600",
  MEDIUM: "bg-gray-700",
  GHOST: "bg-gray-900",
  DEVTO: "bg-gray-800",
  HASHNODE: "bg-blue-600",
  NOSTR: "bg-violet-700",
  PIXELFED: "bg-teal-600",
  VIMEO: "bg-teal-500",
  BEEHIIV: "bg-amber-600",
  GOOGLE_BUSINESS: "bg-green-600",
  LINKEDIN_COMPANY: "bg-blue-700",
};

function platformLabel(platform: string): string {
  const labels: Record<string, string> = {
    FACEBOOK: "Facebook",
    INSTAGRAM: "Instagram",
    THREADS: "Threads",
    TWITTER: "X (Twitter)",
    LINKEDIN: "LinkedIn",
    TIKTOK: "TikTok",
    YOUTUBE: "YouTube",
    PINTEREST: "Pinterest",
    REDDIT: "Reddit",
    BLUESKY: "Bluesky",
    MASTODON: "Mastodon",
    TELEGRAM: "Telegram",
    TUMBLR: "Tumblr",
    WORDPRESS: "WordPress",
    MEDIUM: "Medium",
    GHOST: "Ghost",
    DEVTO: "Dev.to",
    HASHNODE: "Hashnode",
    NOSTR: "Nostr",
    PIXELFED: "Pixelfed",
    VIMEO: "Vimeo",
    BEEHIIV: "Beehiiv",
    GOOGLE_BUSINESS: "Google Business",
  };
  return labels[platform] ?? platform;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function GrowthBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground text-sm">—</span>;
  if (value > 0)
    return (
      <span className="flex items-center gap-1 text-green-600 text-sm font-medium">
        <TrendingUp className="h-3.5 w-3.5" />+{formatNumber(value)}
      </span>
    );
  if (value < 0)
    return (
      <span className="flex items-center gap-1 text-red-500 text-sm font-medium">
        <TrendingDown className="h-3.5 w-3.5" />{formatNumber(value)}
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-muted-foreground text-sm">
      <Minus className="h-3.5 w-3.5" />0
    </span>
  );
}

export default function PortfolioPage() {
  const [data, setData] = useState<PortfolioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/analytics/portfolio")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError("Failed to load portfolio data"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-bold">Account Portfolio</h1>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card rounded-lg border p-4 h-24 animate-pulse bg-muted" />
          ))}
        </div>
        <div className="bg-card rounded-lg border p-4 h-64 animate-pulse bg-muted" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Account Portfolio</h1>
        <div className="text-red-500">{error ?? "No data available"}</div>
      </div>
    );
  }

  if (data.totalAccounts === 0) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Account Portfolio</h1>
        <div className="bg-card border rounded-lg p-12 text-center text-muted-foreground">
          <Globe className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium mb-2">No accounts connected</p>
          <p className="text-sm">
            Connect your social accounts to see your portfolio summary.
          </p>
        </div>
      </div>
    );
  }

  const kpiCards = [
    {
      label: "Connected Accounts",
      value: `${data.activeAccounts} / ${data.totalAccounts}`,
      icon: Users,
      sub: `${data.totalAccounts - data.activeAccounts} inactive`,
    },
    {
      label: "Total Followers",
      value: formatNumber(data.totalFollowers),
      icon: TrendingUp,
      sub:
        data.totalFollowerGrowth7d !== 0
          ? `${data.totalFollowerGrowth7d > 0 ? "+" : ""}${formatNumber(data.totalFollowerGrowth7d)} last 7d`
          : "No change last 7d",
      subColor:
        data.totalFollowerGrowth7d > 0
          ? "text-green-600"
          : data.totalFollowerGrowth7d < 0
          ? "text-red-500"
          : "text-muted-foreground",
    },
    {
      label: "Posts Published (30d)",
      value: formatNumber(data.totalPublished30d),
      icon: Activity,
      sub: `${data.topPlatformByEngagement ? platformLabel(data.topPlatformByEngagement) + " leads engagement" : "No engagement data"}`,
    },
    {
      label: "Total Engagement (30d)",
      value: formatNumber(data.totalEngagement30d),
      icon: BarChart3,
      sub: `${data.overallEngagementRate}% avg rate`,
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Account Portfolio</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Unified summary of all your connected social accounts
          </p>
        </div>
        {data.topPlatformByFollowers && (
          <div className="text-right text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {platformLabel(data.topPlatformByFollowers)}
            </span>{" "}
            leads by followers
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="bg-card rounded-lg border p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">{card.label}</span>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-2xl font-bold">{card.value}</div>
              <div
                className={`text-xs mt-1 ${
                  "subColor" in card ? card.subColor : "text-muted-foreground"
                }`}
              >
                {card.sub}
              </div>
            </div>
          );
        })}
      </div>

      {/* Per-Account Table */}
      <div className="bg-card rounded-lg border">
        <div className="px-4 py-3 border-b">
          <h2 className="font-semibold">Per-Account Breakdown</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                  Account
                </th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                  Platform
                </th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                  Followers
                </th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                  7d Growth
                </th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                  Posts (30d)
                </th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                  Engagement (30d)
                </th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                  Avg Rate
                </th>
                <th className="px-4 py-2 text-center font-medium text-muted-foreground">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {data.accounts.map((acc) => (
                <tr
                  key={acc.accountId}
                  className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3 font-medium">{acc.accountName}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white ${
                        PLATFORM_COLORS[acc.platform] ?? "bg-gray-500"
                      }`}
                    >
                      {platformLabel(acc.platform)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {acc.followers !== null ? formatNumber(acc.followers) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <GrowthBadge value={acc.followerGrowth7d} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {acc.postsPublished30d}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatNumber(acc.totalEngagement30d)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {acc.avgEngagementRate > 0 ? `${acc.avgEngagementRate}%` : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        acc.isActive
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                      }`}
                    >
                      {acc.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Platform Distribution */}
      {data.accounts.length > 0 && (
        <div className="bg-card rounded-lg border p-4">
          <h2 className="font-semibold mb-4">Follower Distribution by Platform</h2>
          <div className="space-y-3">
            {data.accounts
              .filter((a) => a.followers !== null && a.followers > 0)
              .sort((a, b) => (b.followers ?? 0) - (a.followers ?? 0))
              .map((acc) => {
                const pct =
                  data.totalFollowers > 0
                    ? ((acc.followers ?? 0) / data.totalFollowers) * 100
                    : 0;
                return (
                  <div key={acc.accountId}>
                    <div className="flex items-center justify-between mb-1 text-sm">
                      <span className="font-medium">{acc.accountName}</span>
                      <span className="text-muted-foreground">
                        {formatNumber(acc.followers!)} ({pct.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          PLATFORM_COLORS[acc.platform] ?? "bg-gray-500"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            {data.accounts.every((a) => !a.followers) && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No follower data synced yet. Connect accounts and sync audience metrics.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
