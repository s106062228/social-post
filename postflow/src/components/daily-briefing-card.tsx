"use client";

import { useState, useEffect } from "react";
import { Sparkles, RefreshCw, Calendar, TrendingUp, Hash, AlertCircle } from "lucide-react";

interface BriefingData {
  id: string;
  date: string;
  todayScheduled: number;
  weekScheduled: number;
  yesterdayStats: {
    published: number;
    totalEngagement: number;
    topPlatform: string | null;
  };
  contentGaps: string[];
  topHashtags: { tag: string; count: number }[];
  summary: string;
  recommendations: string[];
  generatedAt: string;
}

export function DailyBriefingCard() {
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchBriefing() {
    try {
      const res = await fetch("/api/ai/daily-briefing");
      if (res.ok) {
        const data = await res.json() as { briefing: BriefingData | null };
        setBriefing(data.briefing);
      }
    } catch {
      // silently ignore fetch errors
    } finally {
      setLoading(false);
    }
  }

  async function generateBriefing() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/daily-briefing", { method: "POST" });
      if (res.ok) {
        const data = await res.json() as { briefing: BriefingData };
        setBriefing(data.briefing);
      } else if (res.status === 503) {
        setError("AI features are not configured.");
      } else {
        setError("Failed to generate briefing. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    fetchBriefing();
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border bg-card p-6 space-y-4 animate-pulse">
        <div className="h-5 bg-muted rounded w-40" />
        <div className="h-4 bg-muted rounded w-full" />
        <div className="h-4 bg-muted rounded w-3/4" />
      </div>
    );
  }

  if (!briefing) {
    return (
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-500" />
          <h3 className="font-semibold text-lg">Daily Briefing</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Start your day with an AI-powered summary of today&apos;s schedule, yesterday&apos;s performance, and personalised recommendations.
        </p>
        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}
        <button
          onClick={generateBriefing}
          disabled={generating}
          className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
        >
          {generating ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {generating ? "Generating…" : "Generate Briefing"}
        </button>
      </div>
    );
  }

  const generatedTime = new Date(briefing.generatedAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="rounded-xl border bg-card p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-500" />
          <div>
            <h3 className="font-semibold text-lg">Daily Briefing</h3>
            <p className="text-xs text-muted-foreground">Generated at {generatedTime}</p>
          </div>
        </div>
        <button
          onClick={generateBriefing}
          disabled={generating}
          title="Regenerate"
          className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${generating ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Summary */}
      <p className="text-sm text-foreground leading-relaxed">{briefing.summary}</p>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-muted/50 p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-blue-600 mb-1">
            <Calendar className="h-4 w-4" />
          </div>
          <div className="text-2xl font-bold">{briefing.todayScheduled}</div>
          <div className="text-xs text-muted-foreground">Posts Today</div>
        </div>
        <div className="rounded-lg bg-muted/50 p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-green-600 mb-1">
            <Calendar className="h-4 w-4" />
          </div>
          <div className="text-2xl font-bold">{briefing.weekScheduled}</div>
          <div className="text-xs text-muted-foreground">This Week</div>
        </div>
        <div className="rounded-lg bg-muted/50 p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-purple-600 mb-1">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div className="text-2xl font-bold">{briefing.yesterdayStats.totalEngagement}</div>
          <div className="text-xs text-muted-foreground">Yesterday&apos;s Eng.</div>
        </div>
      </div>

      {/* Content gaps */}
      {briefing.contentGaps.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm font-medium mb-1">
            <AlertCircle className="h-4 w-4" />
            Content Gaps ({briefing.contentGaps.length} days)
          </div>
          <div className="flex flex-wrap gap-1">
            {briefing.contentGaps.map((d) => (
              <span
                key={d}
                className="text-xs px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300"
              >
                {new Date(d + "T12:00:00Z").toLocaleDateString([], { month: "short", day: "numeric" })}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Top hashtags */}
      {briefing.topHashtags.length > 0 && (
        <div>
          <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground mb-2">
            <Hash className="h-4 w-4" />
            Top Hashtags (30 days)
          </div>
          <div className="flex flex-wrap gap-1">
            {briefing.topHashtags.map((h) => (
              <span
                key={h.tag}
                className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground"
              >
                {h.tag} <span className="opacity-60">×{h.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {briefing.recommendations.length > 0 && (
        <div>
          <div className="text-sm font-medium text-muted-foreground mb-2">Today&apos;s Recommendations</div>
          <ul className="space-y-2">
            {briefing.recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 flex-shrink-0 h-5 w-5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 flex items-center justify-center text-xs font-bold">
                  {i + 1}
                </span>
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}
    </div>
  );
}
