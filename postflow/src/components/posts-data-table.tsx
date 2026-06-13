"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  ExternalLink,
  RefreshCw,
} from "lucide-react";

type SortField = "date" | "engagement" | "reach" | "likes" | "comments" | "shares";
type SortDir = "asc" | "desc";
type Period = "7d" | "30d" | "90d" | "all";

interface Row {
  publishResultId: string;
  postId: string;
  content: string;
  platform: string;
  publishedAt: string | null;
  publishedUrl: string | null;
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  engagementScore: number;
}

interface TableState {
  rows: Row[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const PLATFORM_COLORS: Record<string, string> = {
  FACEBOOK: "bg-blue-100 text-blue-800",
  INSTAGRAM: "bg-pink-100 text-pink-800",
  THREADS: "bg-gray-100 text-gray-800",
  TWITTER: "bg-sky-100 text-sky-800",
  LINKEDIN: "bg-blue-100 text-blue-700",
  TIKTOK: "bg-red-100 text-red-800",
  YOUTUBE: "bg-red-100 text-red-700",
  PINTEREST: "bg-red-100 text-red-900",
  REDDIT: "bg-orange-100 text-orange-800",
  BLUESKY: "bg-cyan-100 text-cyan-800",
  MASTODON: "bg-purple-100 text-purple-800",
  TELEGRAM: "bg-blue-100 text-blue-600",
  NOSTR: "bg-yellow-100 text-yellow-800",
  TUMBLR: "bg-indigo-100 text-indigo-800",
  WORDPRESS: "bg-slate-100 text-slate-800",
  MEDIUM: "bg-gray-100 text-gray-700",
  GHOST: "bg-yellow-100 text-yellow-900",
  DEVTO: "bg-gray-100 text-gray-900",
  HASHNODE: "bg-blue-100 text-blue-900",
  VIMEO: "bg-teal-100 text-teal-800",
  PIXELFED: "bg-green-100 text-green-800",
  BEEHIIV: "bg-amber-100 text-amber-800",
  GOOGLE_BUSINESS: "bg-green-100 text-green-700",
};

function SortIcon({ field, sort, dir }: { field: SortField; sort: SortField; dir: SortDir }) {
  if (sort !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
  return dir === "asc" ? (
    <ArrowUp className="h-3 w-3 ml-1" />
  ) : (
    <ArrowDown className="h-3 w-3 ml-1" />
  );
}

interface Props {
  initialPeriod?: Period;
  initialPlatform?: string;
}

export function PostsDataTable({ initialPeriod = "30d", initialPlatform }: Props) {
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [platform, setPlatform] = useState(initialPlatform ?? "");
  const [sort, setSort] = useState<SortField>("date");
  const [dir, setDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [state, setState] = useState<TableState | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        period,
        sort,
        dir,
        page: String(page),
        limit: "50",
      });
      if (platform) params.set("platform", platform);
      const res = await fetch(`/api/analytics/posts-table?${params}`);
      if (res.ok) {
        const data = (await res.json()) as TableState;
        setState(data);
      }
    } finally {
      setLoading(false);
    }
  }, [period, platform, sort, dir, page]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleSort(field: SortField) {
    if (sort === field) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(field);
      setDir("desc");
    }
    setPage(1);
  }

  async function handleExport() {
    setExporting(true);
    try {
      const params = new URLSearchParams({ period, sort, dir });
      if (platform) params.set("platform", platform);
      const res = await fetch(`/api/analytics/posts-table/export?${params}`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const date = new Date().toISOString().split("T")[0];
      a.href = url;
      a.download = `postflow-posts-${date}-${period}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const colHeader = (label: string, field: SortField) => (
    <th
      className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none whitespace-nowrap"
      onClick={() => handleSort(field)}
    >
      <span className="flex items-center">
        {label}
        <SortIcon field={field} sort={sort} dir={dir} />
      </span>
    </th>
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {(["7d", "30d", "90d", "all"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => { setPeriod(p); setPage(1); }}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                period === p
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {p === "all" ? "All time" : p}
            </button>
          ))}
          <select
            value={platform}
            onChange={(e) => { setPlatform(e.target.value); setPage(1); }}
            className="px-3 py-1 rounded-md border bg-background text-sm"
          >
            <option value="">All platforms</option>
            {Object.keys(PLATFORM_COLORS).map((p) => (
              <option key={p} value={p}>
                {p.charAt(0) + p.slice(1).toLowerCase().replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-1 px-3 py-1 rounded-md border bg-background text-sm hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={() => void handleExport()}
            disabled={exporting}
            className="flex items-center gap-1 px-3 py-1 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
          >
            <Download className="h-3 w-3" />
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Platform
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Content
              </th>
              {colHeader("Published", "date")}
              {colHeader("Impressions", "engagement")}
              {colHeader("Reach", "reach")}
              {colHeader("Likes", "likes")}
              {colHeader("Comments", "comments")}
              {colHeader("Shares", "shares")}
              {colHeader("Score", "engagement")}
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Link
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading && !state ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : !state || state.rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                  No published posts found for the selected filters.
                </td>
              </tr>
            ) : (
              state.rows.map((row) => (
                <tr key={row.publishResultId} className="hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        PLATFORM_COLORS[row.platform] ?? "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {row.platform.charAt(0) + row.platform.slice(1).toLowerCase().replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-3 py-2 max-w-xs">
                    <span className="line-clamp-2 text-xs text-muted-foreground">
                      {row.content}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                    {row.publishedAt
                      ? new Date(row.publishedAt).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {row.impressions.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {row.reach.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {row.likes.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {row.comments.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {row.shares.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <span
                      className={`font-semibold ${
                        row.engagementScore >= 100
                          ? "text-green-600"
                          : row.engagementScore >= 50
                          ? "text-yellow-600"
                          : "text-muted-foreground"
                      }`}
                    >
                      {row.engagementScore}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {row.publishedUrl ? (
                      <a
                        href={row.publishedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:opacity-80"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {state && state.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {((page - 1) * state.limit) + 1}–
            {Math.min(page * state.limit, state.total)} of {state.total} rows
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2 py-1 rounded border hover:bg-muted disabled:opacity-40"
            >
              ‹
            </button>
            {Array.from({ length: Math.min(7, state.totalPages) }, (_, i) => {
              let p: number;
              if (state.totalPages <= 7) {
                p = i + 1;
              } else if (page <= 4) {
                p = i + 1;
              } else if (page >= state.totalPages - 3) {
                p = state.totalPages - 6 + i;
              } else {
                p = page - 3 + i;
              }
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`px-2 py-1 rounded border text-xs ${
                    p === page
                      ? "bg-primary text-primary-foreground border-primary"
                      : "hover:bg-muted"
                  }`}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => setPage((p) => Math.min(state.totalPages, p + 1))}
              disabled={page === state.totalPages}
              className="px-2 py-1 rounded border hover:bg-muted disabled:opacity-40"
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
