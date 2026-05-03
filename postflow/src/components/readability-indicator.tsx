"use client";

import { useMemo } from "react";
import { analyzeReadability, type ReadabilityResult } from "@/lib/readability";

interface ReadabilityIndicatorProps {
  content: string;
}

const LABEL_CONFIG: Record<
  ReadabilityResult["label"],
  { text: string; className: string }
> = {
  "very-easy": { text: "Very Easy", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  easy: { text: "Easy", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" },
  medium: { text: "Medium", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  hard: { text: "Hard", className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400" },
  "very-hard": { text: "Very Hard", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
};

function formatReadingTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s read`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s read` : `${mins}m read`;
}

export function ReadabilityIndicator({ content }: ReadabilityIndicatorProps) {
  const result = useMemo(() => analyzeReadability(content), [content]);

  if (result.wordCount === 0) return null;

  const config = LABEL_CONFIG[result.label];

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}
        title={`Flesch-Kincaid score: ${result.fleschKincaid} · Grade level: ${result.gradeLevel} · Avg ${result.avgWordsPerSentence} words/sentence`}
      >
        {config.text}
      </span>
      <span className="text-xs text-muted-foreground">
        {result.wordCount} {result.wordCount === 1 ? "word" : "words"}
      </span>
      <span className="text-xs text-muted-foreground">·</span>
      <span className="text-xs text-muted-foreground">
        {formatReadingTime(result.readingTimeSeconds)}
      </span>
      <span className="text-xs text-muted-foreground">·</span>
      <span className="text-xs text-muted-foreground" title="Flesch-Kincaid Reading Ease score (0–100, higher = easier)">
        FK {result.fleschKincaid}
      </span>
    </div>
  );
}
