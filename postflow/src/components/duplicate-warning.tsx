"use client";

import { useState, useEffect, useRef } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";

interface DuplicateMatch {
  id: string;
  contentPreview: string;
  status: string;
  createdAt: string;
  score: number;
}

interface DuplicateWarningProps {
  content: string;
  excludeId?: string;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  PUBLISHING: "Publishing",
  PUBLISHED: "Published",
  PARTIALLY_PUBLISHED: "Partial",
  FAILED: "Failed",
};

export function DuplicateWarning({ content, excludeId }: DuplicateWarningProps) {
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (content.trim().length < 20) {
      setDuplicates([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      setLoading(true);
      fetch("/api/posts/check-duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim(), ...(excludeId ? { excludeId } : {}) }),
      })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((data: { duplicates: DuplicateMatch[] }) => {
          setDuplicates(data.duplicates ?? []);
        })
        .catch(() => {
          setDuplicates([]);
        })
        .finally(() => setLoading(false));
    }, 600);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [content, excludeId]);

  if (loading || duplicates.length === 0) return null;

  return (
    <div className="rounded-md border border-yellow-300 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-950/30 p-3 text-sm">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-yellow-800 dark:text-yellow-300"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="flex items-center gap-1.5 font-medium">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {duplicates.length === 1
            ? "Similar post detected"
            : `${duplicates.length} similar posts detected`}
        </span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0" />
        )}
      </button>

      {expanded && (
        <ul className="mt-3 flex flex-col gap-2">
          {duplicates.map((d) => (
            <li
              key={d.id}
              className="flex items-start justify-between gap-2 rounded bg-yellow-100/60 dark:bg-yellow-900/20 px-3 py-2"
            >
              <div className="flex flex-col gap-0.5 min-w-0">
                <p className="truncate text-xs text-yellow-900 dark:text-yellow-200">
                  {d.contentPreview}
                  {d.contentPreview.length >= 120 ? "…" : ""}
                </p>
                <div className="flex items-center gap-2 text-xs text-yellow-700 dark:text-yellow-400">
                  <span className="font-medium">{d.score}% similar</span>
                  <span>·</span>
                  <span>{STATUS_LABELS[d.status] ?? d.status}</span>
                  <span>·</span>
                  <span>{new Date(d.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <a
                href={`/posts/${d.id}/versions`}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-yellow-700 dark:text-yellow-400 hover:text-yellow-900 dark:hover:text-yellow-200"
                title="View post"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
