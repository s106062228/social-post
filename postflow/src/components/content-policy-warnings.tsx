"use client";

import { useState, useEffect, useRef } from "react";
import { AlertTriangle, XCircle, ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";
import type { Platform, MediaType } from "@prisma/client";
import type { PlatformValidationResult } from "@/lib/content-validator";

interface ContentPolicyWarningsProps {
  content: string;
  platforms: Platform[];
  mediaType: MediaType;
  mediaUrls: string[];
}

interface ValidateResponse {
  results: PlatformValidationResult[];
  overallValid: boolean;
}

export function ContentPolicyWarnings({
  content,
  platforms,
  mediaType,
  mediaUrls,
}: ContentPolicyWarningsProps) {
  const [data, setData] = useState<ValidateResponse | null>(null);
  const [expanded, setExpanded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (platforms.length === 0) {
      setData(null);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetch("/api/posts/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, platforms, mediaType, mediaUrls }),
      })
        .then((r) => r.json())
        .then((d: ValidateResponse) => setData(d))
        .catch(() => null);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [content, platforms, mediaType, mediaUrls]);

  if (!data) return null;

  const hasIssues = data.results.some(
    (r) => r.errors.length > 0 || r.warnings.length > 0
  );

  if (!hasIssues) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
        <CheckCircle2 className="h-3 w-3" />
        Policy OK
      </span>
    );
  }

  const errorCount = data.results.reduce((n, r) => n + r.errors.length, 0);
  const warningCount = data.results.reduce((n, r) => n + r.warnings.length, 0);
  const hasErrors = errorCount > 0;

  return (
    <div
      className={`rounded-md border px-3 py-2 text-xs ${
        hasErrors
          ? "border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/10"
          : "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/10"
      }`}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2"
        onClick={() => setExpanded((v) => !v)}
      >
        <span
          className={`flex items-center gap-1.5 font-medium ${
            hasErrors
              ? "text-red-700 dark:text-red-400"
              : "text-amber-700 dark:text-amber-400"
          }`}
        >
          {hasErrors ? (
            <XCircle className="h-3.5 w-3.5" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5" />
          )}
          {hasErrors && `${errorCount} error${errorCount !== 1 ? "s" : ""}`}
          {hasErrors && warningCount > 0 && ", "}
          {warningCount > 0 &&
            `${warningCount} warning${warningCount !== 1 ? "s" : ""}`}
        </span>
        {expanded ? (
          <ChevronUp
            className={`h-3.5 w-3.5 ${hasErrors ? "text-red-500" : "text-amber-500"}`}
          />
        ) : (
          <ChevronDown
            className={`h-3.5 w-3.5 ${hasErrors ? "text-red-500" : "text-amber-500"}`}
          />
        )}
      </button>

      {expanded && (
        <ul className={`mt-2 space-y-1 border-t pt-2 ${hasErrors ? "border-red-200 dark:border-red-900/40" : "border-amber-200 dark:border-amber-900/40"}`}>
          {data.results.map((r) =>
            [...r.errors.map((e) => ({ platform: r.platform, msg: e, isError: true })),
             ...r.warnings.map((w) => ({ platform: r.platform, msg: w, isError: false }))].map(
              ({ platform, msg, isError }, i) => (
                <li
                  key={`${platform}-${i}`}
                  className={
                    isError
                      ? "text-red-600 dark:text-red-400"
                      : "text-amber-600 dark:text-amber-400"
                  }
                >
                  <span className="font-medium">{platform}:</span> {msg}
                </li>
              )
            )
          )}
        </ul>
      )}
    </div>
  );
}
