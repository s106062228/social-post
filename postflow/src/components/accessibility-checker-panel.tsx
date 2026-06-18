"use client";

import { useState, useEffect, useRef } from "react";
import type { AccessibilityCheckResult, AccessibilityIssue } from "@/lib/ai";

interface Props {
  content: string;
  altTexts?: string[];
  platform?: string;
}

const SEVERITY_COLOR: Record<AccessibilityIssue["severity"], string> = {
  high: "text-red-600 bg-red-50 border-red-200",
  medium: "text-amber-600 bg-amber-50 border-amber-200",
  low: "text-blue-600 bg-blue-50 border-blue-200",
};

const SEVERITY_DOT: Record<AccessibilityIssue["severity"], string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-blue-500",
};

const TYPE_LABEL: Record<AccessibilityIssue["type"], string> = {
  readability: "Readability",
  inclusive_language: "Inclusive Language",
  emoji: "Emoji Usage",
  hashtag_casing: "Hashtag Casing",
  alt_text: "Alt Text",
  sentence_length: "Sentence Length",
};

export function AccessibilityCheckerPanel({ content, altTexts, platform }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AccessibilityCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastContent = useRef<string>("");

  useEffect(() => {
    if (!open || content.length < 10) return;
    if (content === lastContent.current) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      lastContent.current = content;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/ai/accessibility-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, altTexts, platform }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          setError(data.error ?? "Check failed");
        } else {
          setResult((await res.json()) as AccessibilityCheckResult);
        }
      } catch {
        setError("Network error");
      } finally {
        setLoading(false);
      }
    }, 1200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [content, altTexts, platform, open]);

  const scoreColor =
    result == null
      ? "text-gray-500"
      : result.score >= 80
        ? "text-green-600"
        : result.score >= 60
          ? "text-amber-600"
          : "text-red-600";

  const byHighSeverity = (a: AccessibilityIssue, b: AccessibilityIssue) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.severity] - order[b.severity];
  };

  return (
    <div className="border rounded-md text-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 font-medium text-gray-700 hover:bg-gray-50"
      >
        <span className="flex items-center gap-2">
          <span>♿ Accessibility Check</span>
          {result && (
            <span className={`text-xs font-semibold ${scoreColor}`}>
              {result.score}/100{" "}
              {result.passesStandards ? "✓" : "✗"}
            </span>
          )}
          {loading && (
            <span className="text-xs text-gray-400 animate-pulse">
              Checking…
            </span>
          )}
        </span>
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {open && (
        <div className="border-t px-3 py-3 space-y-3">
          {content.length < 10 && (
            <p className="text-xs text-gray-400 italic">
              Enter at least 10 characters to enable accessibility checking.
            </p>
          )}

          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}

          {result && !loading && (
            <>
              <div className="flex items-center gap-3">
                <div className={`text-2xl font-bold ${scoreColor}`}>
                  {result.score}
                </div>
                <div>
                  <p className="text-xs text-gray-500">Accessibility Score</p>
                  <p
                    className={`text-xs font-medium ${
                      result.passesStandards ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {result.passesStandards
                      ? "Passes Standards (≥70)"
                      : "Below Standard (<70)"}
                  </p>
                </div>
              </div>

              <p className="text-xs text-gray-600">{result.summary}</p>

              {result.issues.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-700">
                    Issues ({result.issues.length})
                  </p>
                  {[...result.issues].sort(byHighSeverity).map((issue, i) => (
                    <div
                      key={i}
                      className={`border rounded p-2 text-xs ${SEVERITY_COLOR[issue.severity]}`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span
                          className={`inline-block w-1.5 h-1.5 rounded-full ${SEVERITY_DOT[issue.severity]}`}
                        />
                        <span className="font-semibold">
                          {TYPE_LABEL[issue.type]}
                        </span>
                        <span className="capitalize opacity-70">
                          · {issue.severity}
                        </span>
                      </div>
                      {issue.text && (
                        <p className="mb-0.5 opacity-80 line-clamp-1">
                          <span className="font-medium">Found:</span>{" "}
                          &quot;{issue.text}&quot;
                        </p>
                      )}
                      <p className="mb-0.5">
                        <span className="font-medium">Fix:</span>{" "}
                        {issue.suggestion}
                      </p>
                      <p className="opacity-70">{issue.explanation}</p>
                    </div>
                  ))}
                </div>
              )}

              {result.recommendations.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-1">
                    Recommendations
                  </p>
                  <ul className="space-y-0.5">
                    {result.recommendations.map((r, i) => (
                      <li key={i} className="text-xs text-gray-600 flex gap-1">
                        <span className="text-green-500 shrink-0">•</span>
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.issues.length === 0 && (
                <p className="text-xs text-green-600 font-medium">
                  ✓ No accessibility issues found
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
