"use client";

import { useState, useEffect, useRef } from "react";
import {
  Lightbulb,
  TrendingUp,
  Globe,
  MessageSquare,
  Target,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import type { WritingCoachFeedback, WritingCoachCategory, WritingCoachImpact } from "@/lib/ai";

interface WritingCoachPanelProps {
  content: string;
  platforms: string[];
  tone?: string;
}

const CATEGORY_CONFIG: Record<
  WritingCoachCategory,
  { label: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  clarity: { label: "Clarity", Icon: Lightbulb },
  engagement: { label: "Engagement", Icon: TrendingUp },
  platform: { label: "Platform Fit", Icon: Globe },
  tone: { label: "Tone", Icon: MessageSquare },
  cta: { label: "Call to Action", Icon: Target },
};

const IMPACT_COLORS: Record<WritingCoachImpact, string> = {
  high: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  low: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 70
      ? "text-green-600 dark:text-green-400"
      : score >= 40
      ? "text-yellow-600 dark:text-yellow-400"
      : "text-red-600 dark:text-red-400";
  return (
    <span className={`text-lg font-bold ${color}`}>{score}/100</span>
  );
}

const DEBOUNCE_MS = 1500;

export function WritingCoachPanel({
  content,
  platforms,
  tone,
}: WritingCoachPanelProps) {
  const [feedback, setFeedback] = useState<WritingCoachFeedback | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFetchRef = useRef<string>("");

  const fetchFeedback = async (text: string, plats: string[], t?: string) => {
    if (text.trim().length < 20 || plats.length === 0) {
      setFeedback(null);
      return;
    }
    const key = `${text}|${plats.join(",")}|${t ?? ""}`;
    if (key === lastFetchRef.current) return;
    lastFetchRef.current = key;
    setLoading(true);
    try {
      const res = await fetch("/api/ai/writing-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, platforms: plats, tone: t }),
      });
      if (res.ok) {
        const data = (await res.json()) as WritingCoachFeedback;
        setFeedback(data);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchFeedback(content, platforms, tone);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [content, platforms, tone, open]);

  const handleRefresh = () => {
    lastFetchRef.current = "";
    void fetchFeedback(content, platforms, tone);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 py-1"
      >
        <Lightbulb className="h-4 w-4" />
        Writing Coach
      </button>
    );
  }

  return (
    <div className="border rounded-lg bg-card">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Writing Coach</span>
          {feedback && <ScoreBadge score={feedback.score} />}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading || content.trim().length < 20}
            className="p-1 rounded hover:bg-accent disabled:opacity-40"
            title="Refresh analysis"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 text-muted-foreground ${loading ? "animate-spin" : ""}`}
            />
          </button>
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="p-1 rounded hover:bg-accent"
          >
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-xs text-muted-foreground hover:text-foreground px-1"
          >
            ×
          </button>
        </div>
      </div>

      {expanded && (
        <div className="p-3 space-y-2">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing your content…
            </div>
          )}

          {!loading && content.trim().length < 20 && (
            <p className="text-sm text-muted-foreground">
              Write at least 20 characters to get writing suggestions.
            </p>
          )}

          {!loading && feedback && content.trim().length >= 20 && (
            <>
              {feedback.summary && (
                <p className="text-sm text-muted-foreground">
                  {feedback.summary}
                </p>
              )}
              {feedback.improvements.length > 0 && (
                <ul className="space-y-2">
                  {feedback.improvements.map((imp, idx) => {
                    const cfg = CATEGORY_CONFIG[imp.category];
                    const Icon = cfg.Icon;
                    return (
                      <li
                        key={idx}
                        className="flex items-start gap-2 text-sm"
                      >
                        <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <span className="text-foreground">
                            {imp.suggestion}
                          </span>
                        </div>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded shrink-0 font-medium ${IMPACT_COLORS[imp.impact]}`}
                        >
                          {imp.impact}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {feedback.improvements.length === 0 && (
                <p className="text-sm text-green-600 dark:text-green-400">
                  Great writing! No major improvements needed.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
