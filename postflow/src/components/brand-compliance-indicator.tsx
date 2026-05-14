"use client";

import { useState, useEffect, useRef } from "react";
import { ShieldCheck, ShieldAlert, ChevronDown, ChevronUp } from "lucide-react";
import type { ComplianceResult } from "@/lib/brand-compliance";

interface BrandComplianceIndicatorProps {
  content: string;
}

export function BrandComplianceIndicator({ content }: BrandComplianceIndicatorProps) {
  const [result, setResult] = useState<ComplianceResult | null>(null);
  const [expanded, setExpanded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!content || content.trim().length === 0) {
      setResult(null);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetch("/api/brand-compliance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      })
        .then((r) => r.json())
        .then((data: ComplianceResult) => setResult(data))
        .catch(() => null);
    }, 600);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [content]);

  if (!result) return null;

  if (result.compliant) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
        title="Content passes all brand guidelines"
      >
        <ShieldCheck className="h-3 w-3" />
        Brand Compliant
      </span>
    );
  }

  return (
    <div className="rounded-md border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/10 px-3 py-2 text-xs">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="flex items-center gap-1.5 font-medium text-red-700 dark:text-red-400">
          <ShieldAlert className="h-3.5 w-3.5" />
          {result.violations.length} brand violation{result.violations.length !== 1 ? "s" : ""}
        </span>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 text-red-500" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-red-500" />
        )}
      </button>

      {expanded && (
        <ul className="mt-2 space-y-1 border-t border-red-200 dark:border-red-900/40 pt-2">
          {result.violations.map((v, i) => (
            <li key={i} className="text-red-600 dark:text-red-400">
              · {v.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
