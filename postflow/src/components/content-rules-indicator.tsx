"use client";

import { useEffect, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";

interface RuleViolation {
  ruleId: string;
  ruleName: string;
  type: string;
  severity: "ERROR" | "WARNING";
  message: string;
}

interface Props {
  content: string;
  platform?: string;
}

export function ContentRulesIndicator({ content, platform }: Props) {
  const [violations, setViolations] = useState<RuleViolation[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (content.length < 3) {
      setViolations([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/content-rules/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, platform }),
        });
        if (res.ok) {
          const data = (await res.json()) as { violations?: RuleViolation[] };
          setViolations(data.violations ?? []);
        }
      } finally {
        setLoading(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [content, platform]);

  if (loading)
    return (
      <p className="text-xs text-muted-foreground">Checking rules&hellip;</p>
    );

  if (violations.length === 0 && content.length >= 3) {
    return (
      <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
        <CheckCircle2 className="h-3 w-3" />
        Rules passed
      </div>
    );
  }

  if (violations.length === 0) return null;

  const errors = violations.filter((v) => v.severity === "ERROR");
  const warnings = violations.filter((v) => v.severity === "WARNING");

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-2 text-xs">
      <button
        type="button"
        className="flex w-full items-center gap-1 font-medium"
        onClick={() => setExpanded((e) => !e)}
      >
        {errors.length > 0 ? (
          <AlertCircle className="h-3 w-3 text-red-500" />
        ) : (
          <AlertTriangle className="h-3 w-3 text-amber-500" />
        )}
        <span>
          {errors.length > 0
            ? `${errors.length} rule error${errors.length > 1 ? "s" : ""}`
            : `${warnings.length} rule warning${warnings.length > 1 ? "s" : ""}`}
        </span>
        <span className="ml-auto text-muted-foreground">
          {expanded ? "▲" : "▼"}
        </span>
      </button>
      {expanded && (
        <ul className="mt-2 space-y-1">
          {violations.map((v) => (
            <li
              key={v.ruleId}
              className={`flex gap-1 ${
                v.severity === "ERROR"
                  ? "text-red-600 dark:text-red-400"
                  : "text-amber-700 dark:text-amber-400"
              }`}
            >
              {v.severity === "ERROR" ? (
                <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
              )}
              <span>
                <strong>{v.ruleName}:</strong> {v.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
