"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Megaphone, CheckCheck, ArrowRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface ChangelogEntry {
  id: string;
  title: string;
  summary: string;
  type: string;
  version: string | null;
  publishedAt: string;
  seen: boolean;
}

interface ChangelogResponse {
  entries: ChangelogEntry[];
  unseenCount: number;
}

const TYPE_STYLES: Record<string, { label: string; className: string }> = {
  feature: {
    label: "New",
    className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  },
  improvement: {
    label: "Improved",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  },
  bugfix: {
    label: "Fixed",
    className:
      "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function ChangelogBadge() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ChangelogResponse | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchChangelog = useCallback(async () => {
    try {
      const res = await fetch("/api/changelog?limit=8");
      if (res.ok) {
        const json = (await res.json()) as ChangelogResponse;
        setData(json);
      }
    } catch {
      // silent — background poll
    }
  }, []);

  useEffect(() => {
    void fetchChangelog();
    const id = setInterval(fetchChangelog, 5 * 60 * 1000); // every 5 min
    return () => clearInterval(id);
  }, [fetchChangelog]);

  const markAllSeen = useCallback(async () => {
    try {
      await fetch("/api/changelog/mark-seen", { method: "POST" });
      // Optimistically update
      setData((prev) =>
        prev
          ? {
              entries: prev.entries.map((e) => ({ ...e, seen: true })),
              unseenCount: 0,
            }
          : prev
      );
    } catch {
      // silent
    }
  }, []);

  // Close panel on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const unseenCount = data?.unseenCount ?? 0;

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (!open && unseenCount > 0) {
            void markAllSeen();
          }
        }}
        className="relative p-2 rounded-md hover:bg-accent transition-colors"
        aria-label="What's new"
        title="What's new"
      >
        <Megaphone className="h-5 w-5 text-muted-foreground" />
        {unseenCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center leading-none">
            {unseenCount > 9 ? "9+" : unseenCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-80 rounded-lg border bg-card shadow-lg">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="text-sm font-semibold">What&apos;s New</span>
            <div className="flex items-center gap-2">
              {unseenCount === 0 && (
                <button
                  onClick={() => void markAllSeen()}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  All seen
                </button>
              )}
            </div>
          </div>

          {/* Entries */}
          <div className="max-h-80 overflow-y-auto divide-y">
            {!data && (
              <p className="text-sm text-muted-foreground text-center py-6">
                Loading…
              </p>
            )}
            {data && data.entries.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                No announcements yet
              </p>
            )}
            {data?.entries.map((entry) => {
              const style =
                TYPE_STYLES[entry.type] ?? TYPE_STYLES["feature"];
              return (
                <div
                  key={entry.id}
                  className={cn(
                    "px-4 py-3",
                    !entry.seen && "bg-accent/30"
                  )}
                >
                  <div className="flex items-start gap-2">
                    {!entry.seen && (
                      <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span
                          className={cn(
                            "text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide",
                            style.className
                          )}
                        >
                          {style.label}
                        </span>
                        {entry.version && (
                          <span className="text-[10px] text-muted-foreground">
                            v{entry.version}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium leading-snug">
                        {entry.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {entry.summary}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {timeAgo(entry.publishedAt)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="border-t px-4 py-2">
            <Link
              href="/changelog"
              className="text-xs text-primary flex items-center gap-1 hover:underline"
              onClick={() => setOpen(false)}
            >
              View all changes
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
