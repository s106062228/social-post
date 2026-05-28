"use client";

import type { AccountComparisonData } from "@/app/api/analytics/account-comparison/route";

interface Props {
  accounts: AccountComparisonData[];
}

const PLATFORM_COLORS: Record<string, string> = {
  FACEBOOK: "bg-blue-100 text-blue-800",
  INSTAGRAM: "bg-pink-100 text-pink-800",
  THREADS: "bg-gray-100 text-gray-800",
  TWITTER: "bg-sky-100 text-sky-800",
  LINKEDIN: "bg-indigo-100 text-indigo-800",
  YOUTUBE: "bg-red-100 text-red-800",
  TIKTOK: "bg-rose-100 text-rose-800",
  REDDIT: "bg-orange-100 text-orange-800",
  PINTEREST: "bg-rose-100 text-rose-700",
  BLUESKY: "bg-blue-50 text-blue-700",
  MASTODON: "bg-purple-100 text-purple-800",
  TELEGRAM: "bg-cyan-100 text-cyan-800",
  NOSTR: "bg-yellow-100 text-yellow-800",
  TUMBLR: "bg-indigo-100 text-indigo-700",
  WORDPRESS: "bg-blue-100 text-blue-700",
  MEDIUM: "bg-green-100 text-green-800",
  GHOST: "bg-yellow-100 text-yellow-700",
  DEVTO: "bg-gray-100 text-gray-900",
  HASHNODE: "bg-blue-100 text-blue-900",
  BEEHIIV: "bg-orange-100 text-orange-700",
  PIXELFED: "bg-teal-100 text-teal-800",
  VIMEO: "bg-cyan-100 text-cyan-900",
  GOOGLE_BUSINESS: "bg-green-100 text-green-900",
};

interface MetricRow {
  label: string;
  getValue: (m: AccountComparisonData["metrics"]) => number | null;
  format: (v: number) => string;
  higherIsBetter: boolean;
}

const METRIC_ROWS: MetricRow[] = [
  {
    label: "Posts / 30d",
    getValue: (m) => m.publishedCount30d,
    format: (v) => v.toString(),
    higherIsBetter: true,
  },
  {
    label: "Avg Engagement",
    getValue: (m) => m.avgEngagement,
    format: (v) => v.toLocaleString(undefined, { maximumFractionDigits: 1 }),
    higherIsBetter: true,
  },
  {
    label: "Engagement Rate",
    getValue: (m) => m.engagementRate,
    format: (v) => `${v.toFixed(1)}%`,
    higherIsBetter: true,
  },
  {
    label: "Follower Growth (30d)",
    getValue: (m) => m.followerGrowth30d,
    format: (v) => (v >= 0 ? `+${v.toLocaleString()}` : v.toLocaleString()),
    higherIsBetter: true,
  },
  {
    label: "Posts / Week",
    getValue: (m) => m.postsPerWeek,
    format: (v) => v.toFixed(1),
    higherIsBetter: true,
  },
];

function findWinner(
  accounts: AccountComparisonData[],
  getValue: (m: AccountComparisonData["metrics"]) => number | null,
  higherIsBetter: boolean
): string | null {
  let bestId: string | null = null;
  let bestValue: number | null = null;

  for (const acc of accounts) {
    const val = getValue(acc.metrics);
    if (val === null) continue;
    if (
      bestValue === null ||
      (higherIsBetter ? val > bestValue : val < bestValue)
    ) {
      bestValue = val;
      bestId = acc.accountId;
    }
  }

  // No winner if all tied or all null
  if (bestId === null) return null;
  const winners = accounts.filter((a) => getValue(a.metrics) === bestValue);
  return winners.length === 1 ? bestId : null;
}

export function AccountComparisonCard({ accounts }: Props) {
  if (accounts.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="px-4 py-3 text-left font-medium text-muted-foreground w-40">
              Metric
            </th>
            {accounts.map((acc) => (
              <th key={acc.accountId} className="px-4 py-3 text-center">
                <div className="flex flex-col items-center gap-1">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                      PLATFORM_COLORS[acc.platform] ?? "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {acc.platform}
                  </span>
                  <span className="font-medium text-foreground truncate max-w-[120px]">
                    {acc.accountName}
                  </span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {METRIC_ROWS.map((row) => {
            const winnerId = findWinner(accounts, row.getValue, row.higherIsBetter);
            return (
              <tr key={row.label} className="hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3 font-medium text-muted-foreground">
                  {row.label}
                </td>
                {accounts.map((acc) => {
                  const val = row.getValue(acc.metrics);
                  const isWinner = winnerId === acc.accountId;
                  return (
                    <td
                      key={acc.accountId}
                      className={`px-4 py-3 text-center font-semibold ${
                        isWinner
                          ? "text-green-700 bg-green-50 dark:bg-green-950/20 dark:text-green-400"
                          : "text-foreground"
                      }`}
                    >
                      {val === null ? (
                        <span className="text-muted-foreground font-normal">—</span>
                      ) : (
                        <span className="flex items-center justify-center gap-1">
                          {row.format(val)}
                          {isWinner && (
                            <span className="text-green-500 text-xs" title="Best">
                              ★
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
