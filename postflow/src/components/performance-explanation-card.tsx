"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lightbulb, Loader2, Minus, TrendingDown, TrendingUp } from "lucide-react";

interface KeyFactor {
  factor: string;
  impact: "positive" | "negative" | "neutral";
  description: string;
}

interface ExplanationResult {
  explanation: string;
  keyFactors: KeyFactor[];
  actionItems: string[];
}

interface Props {
  postId: string;
}

function ImpactIcon({ impact }: { impact: KeyFactor["impact"] }) {
  if (impact === "positive")
    return <TrendingUp className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />;
  if (impact === "negative")
    return <TrendingDown className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />;
  return <Minus className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />;
}

function impactColor(impact: KeyFactor["impact"]): string {
  if (impact === "positive") return "text-green-700 dark:text-green-400";
  if (impact === "negative") return "text-red-700 dark:text-red-400";
  return "text-muted-foreground";
}

export function PerformanceExplanationCard({ postId }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExplanationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${postId}/explain-performance`, {
        method: "POST",
      });
      const data = (await res.json()) as ExplanationResult & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to generate explanation");
        return;
      }
      setResult(data);
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-500 shrink-0" />
            <div>
              <CardTitle className="text-base">Performance Explanation</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                AI-generated insights about why this post performed the way it did
              </CardDescription>
            </div>
          </div>
          {!result && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void generate()}
              disabled={loading}
              className="shrink-0"
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Analyzing…
                </>
              ) : (
                "Generate Explanation"
              )}
            </Button>
          )}
          {result && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void generate()}
              disabled={loading}
              className="shrink-0 text-xs"
            >
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                "Regenerate"
              )}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {error && (
          <p className="text-sm text-destructive">
            {error === "No published insights available for this post. Sync insights first."
              ? "No performance insights available yet. Sync insights first to generate an explanation."
              : error}
          </p>
        )}

        {!result && !error && !loading && (
          <p className="text-sm text-muted-foreground">
            Click &quot;Generate Explanation&quot; to get an AI-powered analysis of this post&apos;s performance.
          </p>
        )}

        {loading && !result && (
          <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Analyzing performance data…</span>
          </div>
        )}

        {result && (
          <div className="space-y-5">
            {/* Explanation paragraph */}
            <p className="text-sm leading-relaxed">{result.explanation}</p>

            {/* Key Factors */}
            {result.keyFactors.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Key Factors
                </h4>
                <ul className="space-y-2">
                  {result.keyFactors.map((factor, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <ImpactIcon impact={factor.impact} />
                      <div>
                        <span className={`text-sm font-medium ${impactColor(factor.impact)}`}>
                          {factor.factor}
                        </span>
                        <span className="text-sm text-muted-foreground"> — {factor.description}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Action Items */}
            {result.actionItems.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Next Steps
                </h4>
                <ol className="space-y-1.5 list-none">
                  {result.actionItems.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                        {i + 1}
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
