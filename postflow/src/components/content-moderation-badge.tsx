"use client";

import { useState, useEffect, useRef } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { ModerationResult } from "@/lib/ai";

interface ContentModerationBadgeProps {
  content: string;
}

const SEVERITY_COLORS: Record<
  string,
  { badge: string; dot: string }
> = {
  high: {
    badge: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    dot: "bg-red-500",
  },
  medium: {
    badge:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    dot: "bg-yellow-500",
  },
  low: {
    badge: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    dot: "bg-blue-400",
  },
};

export function ContentModerationBadge({
  content,
}: ContentModerationBadgeProps) {
  const [result, setResult] = useState<ModerationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!content || content.trim().length < 10) {
      setResult(null);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      void fetch("/api/ai/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      })
        .then((r) => {
          if (!r.ok) return null;
          return r.json() as Promise<ModerationResult>;
        })
        .then((data) => {
          if (data) setResult(data);
        })
        .catch(() => null)
        .finally(() => setLoading(false));
    }, 800);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [content]);

  if (loading) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 animate-pulse">
        <ShieldQuestion className="h-3 w-3" />
        Checking…
      </span>
    );
  }

  if (!result) return null;

  if (result.safe && result.issues.length === 0) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
        title={`Content score: ${result.score}/100`}
      >
        <ShieldCheck className="h-3 w-3" />
        Safe
      </span>
    );
  }

  const highestSeverity = result.issues.find((i) => i.severity === "high")
    ? "high"
    : result.issues.find((i) => i.severity === "medium")
      ? "medium"
      : "low";

  const colors = SEVERITY_COLORS[highestSeverity] ?? SEVERITY_COLORS.low;

  return (
    <div
      className={`rounded-md border px-3 py-2 text-xs ${
        highestSeverity === "high"
          ? "border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/10"
          : highestSeverity === "medium"
            ? "border-yellow-200 bg-yellow-50 dark:border-yellow-900/40 dark:bg-yellow-900/10"
            : "border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-900/10"
      }`}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2"
        onClick={() => setExpanded((v) => !v)}
      >
        <span
          className={`flex items-center gap-1.5 font-medium ${
            highestSeverity === "high"
              ? "text-red-700 dark:text-red-400"
              : highestSeverity === "medium"
                ? "text-yellow-700 dark:text-yellow-400"
                : "text-blue-700 dark:text-blue-400"
          }`}
        >
          <ShieldAlert className="h-3.5 w-3.5" />
          {result.issues.length} moderation{" "}
          {result.issues.length !== 1 ? "issues" : "issue"} · score{" "}
          {result.score}/100
        </span>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 opacity-60" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        )}
      </button>

      {expanded && (
        <div className="mt-2 space-y-1.5 border-t border-current/20 pt-2 opacity-80">
          {result.reason && (
            <p className="italic opacity-70">{result.reason}</p>
          )}
          <ul className="space-y-1">
            {result.issues.map((issue, i) => {
              const c = SEVERITY_COLORS[issue.severity] ?? SEVERITY_COLORS.low;
              return (
                <li key={i} className="flex items-start gap-1.5">
                  <span
                    className={`mt-0.5 h-2 w-2 flex-shrink-0 rounded-full ${c.dot}`}
                  />
                  <span>
                    <span
                      className={`mr-1 rounded px-1 py-0.5 text-[10px] font-semibold uppercase ${c.badge}`}
                    >
                      {issue.severity}
                    </span>
                    {issue.description}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
