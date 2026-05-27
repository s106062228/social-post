"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Search, RefreshCw } from "lucide-react";

interface ChangelogEntry {
  id: string;
  title: string;
  summary: string;
  body: string;
  type: string;
  version: string | null;
  publishedAt: string;
  seen: boolean;
}

interface ChangelogResponse {
  entries: ChangelogEntry[];
  unseenCount: number;
}

const TYPE_FILTERS = ["all", "feature", "improvement", "bugfix"] as const;
type TypeFilter = (typeof TYPE_FILTERS)[number];

const TYPE_STYLES: Record<
  string,
  { label: string; className: string; dotClass: string }
> = {
  feature: {
    label: "New Feature",
    className:
      "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200",
    dotClass: "bg-green-500",
  },
  improvement: {
    label: "Improvement",
    className:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200",
    dotClass: "bg-blue-500",
  },
  bugfix: {
    label: "Bug Fix",
    className:
      "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200",
    dotClass: "bg-orange-500",
  },
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Very simple Markdown-like renderer — handles **bold**, `code`, and line breaks
function renderBody(body: string): string {
  return body
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, '<code class="bg-muted px-1 rounded text-sm">$1</code>')
    .replace(/\n/g, "<br />");
}

export function ChangelogClient() {
  const [data, setData] = useState<ChangelogResponse | null>(null);
  const [filter, setFilter] = useState<TypeFilter>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchChangelog = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/changelog?limit=100");
      if (res.ok) {
        const json = (await res.json()) as ChangelogResponse;
        setData(json);
        // Mark all as seen after visiting the page
        await fetch("/api/changelog/mark-seen", { method: "POST" });
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchChangelog();
  }, [fetchChangelog]);

  const filtered = (data?.entries ?? []).filter((entry) => {
    const matchesType = filter === "all" || entry.type === filter;
    const matchesSearch =
      search === "" ||
      entry.title.toLowerCase().includes(search.toLowerCase()) ||
      entry.summary.toLowerCase().includes(search.toLowerCase());
    return matchesType && matchesSearch;
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Type filter pills */}
        <div className="flex gap-2 flex-wrap">
          {TYPE_FILTERS.map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm font-medium capitalize border transition-colors",
                filter === t
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {t === "all" ? "All" : TYPE_STYLES[t]?.label ?? t}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search changelog…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm border rounded-md bg-card focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg font-medium">No entries found</p>
          <p className="text-sm mt-1">
            {search || filter !== "all"
              ? "Try adjusting your filters."
              : "No changelog entries have been published yet."}
          </p>
        </div>
      )}

      {/* Entries */}
      {!loading && filtered.length > 0 && (
        <div className="flex flex-col gap-6">
          {filtered.map((entry) => {
            const style = TYPE_STYLES[entry.type] ?? TYPE_STYLES["feature"];
            return (
              <article
                key={entry.id}
                className="rounded-lg border bg-card p-6 flex flex-col gap-3"
              >
                {/* Header */}
                <div className="flex flex-wrap items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span
                        className={cn(
                          "text-xs font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide",
                          style.className
                        )}
                      >
                        {style.label}
                      </span>
                      {entry.version && (
                        <span className="text-xs text-muted-foreground border rounded-full px-2 py-0.5">
                          v{entry.version}
                        </span>
                      )}
                      {!entry.seen && (
                        <span className="text-xs font-medium text-primary">
                          New
                        </span>
                      )}
                    </div>
                    <h2 className="text-lg font-semibold leading-snug">
                      {entry.title}
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(entry.publishedAt)}
                    </p>
                  </div>
                  <div className={cn("h-3 w-3 rounded-full mt-1.5 shrink-0", style.dotClass)} />
                </div>

                {/* Summary */}
                <p className="text-sm text-muted-foreground">{entry.summary}</p>

                {/* Body */}
                {entry.body && entry.body !== entry.summary && (
                  <div
                    className="text-sm leading-relaxed border-t pt-3"
                    // eslint-disable-next-line react/no-danger
                    dangerouslySetInnerHTML={{ __html: renderBody(entry.body) }}
                  />
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
