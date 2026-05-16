"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { TrendingUp, TrendingDown, Minus, Loader2, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Platform } from "@prisma/client";

interface PlatformPrediction {
  platform: string;
  predictedEngagement: "HIGH" | "MEDIUM" | "LOW";
  confidence: number;
  reasoning: string;
  suggestedImprovements: string[];
}

interface PerformancePredictionCardProps {
  content: string;
  platforms: Platform[];
}

const ENGAGEMENT_CONFIG = {
  HIGH: { label: "High", color: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800", icon: TrendingUp },
  MEDIUM: { label: "Medium", color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800", icon: Minus },
  LOW: { label: "Low", color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800", icon: TrendingDown },
} as const;

export function PerformancePredictionCard({ content, platforms }: PerformancePredictionCardProps) {
  const [predictions, setPredictions] = useState<PlatformPrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFetchedRef = useRef<{ content: string; platforms: string[] } | null>(null);

  const fetchPredictions = useCallback(async (c: string, plats: Platform[]) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/predict-performance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: c, platforms: plats }),
      });
      if (res.status === 503) {
        // AI not configured — silently hide
        setPredictions([]);
        return;
      }
      if (!res.ok) {
        setError("Could not fetch predictions");
        return;
      }
      const data = (await res.json()) as { predictions?: PlatformPrediction[] };
      setPredictions(data.predictions ?? []);
      if ((data.predictions?.length ?? 0) > 0) setExpanded(true);
    } catch {
      setError("Could not fetch predictions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (content.length < 10 || platforms.length === 0) {
      setPredictions([]);
      return;
    }
    const key = { content, platforms: [...platforms].sort() };
    if (
      lastFetchedRef.current?.content === key.content &&
      JSON.stringify(lastFetchedRef.current.platforms) === JSON.stringify(key.platforms)
    ) {
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      lastFetchedRef.current = key;
      void fetchPredictions(content, platforms);
    }, 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [content, platforms, fetchPredictions]);

  if (!process.env.NEXT_PUBLIC_AI_ENABLED && predictions.length === 0 && !loading) return null;
  if (content.length < 10 || platforms.length === 0) return null;
  if (!loading && predictions.length === 0 && !error) return null;

  return (
    <div className="rounded-md border border-border bg-muted/20 text-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <div className="flex items-center gap-2 font-medium text-foreground">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          Performance Prediction
          {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex items-center gap-2">
          {!loading && predictions.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                lastFetchedRef.current = null;
                void fetchPredictions(content, platforms);
              }}
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border px-3 pb-3 pt-2 space-y-2">
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
          {predictions.map((pred) => {
            const cfg = ENGAGEMENT_CONFIG[pred.predictedEngagement];
            const Icon = cfg.icon;
            const confidencePct = Math.round(pred.confidence * 100);
            return (
              <div key={pred.platform} className={`rounded border px-3 py-2 ${cfg.bg}`}>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">{pred.platform}</span>
                  <div className="flex items-center gap-1.5">
                    <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                    <span className={`font-semibold text-xs ${cfg.color}`}>{cfg.label}</span>
                    <span className="text-xs text-muted-foreground">({confidencePct}% confidence)</span>
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{pred.reasoning}</p>
                {pred.suggestedImprovements.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {pred.suggestedImprovements.map((imp, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex gap-1">
                        <span className="text-foreground">→</span>
                        {imp}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
