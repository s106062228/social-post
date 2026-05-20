"use client";

import { useState, useEffect, useCallback } from "react";
import { CheckCircle2, XCircle, ChevronDown, ChevronUp, SearchCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface SeoCheck {
  id: string;
  label: string;
  passed: boolean;
  hint: string;
}

interface SeoResult {
  score: number;
  label: string;
  checks: SeoCheck[];
}

interface SeoAnalysisCardProps {
  postId: string;
}

function scoreColor(score: number): string {
  if (score >= 84) return "text-green-600";
  if (score >= 67) return "text-yellow-600";
  if (score >= 50) return "text-orange-500";
  return "text-red-600";
}

function ringColor(score: number): string {
  if (score >= 84) return "stroke-green-500";
  if (score >= 67) return "stroke-yellow-500";
  if (score >= 50) return "stroke-orange-400";
  return "stroke-red-500";
}

export function SeoAnalysisCard({ postId }: SeoAnalysisCardProps) {
  const [result, setResult] = useState<SeoResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSeo = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${postId}/seo`);
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to load SEO analysis");
      }
      const data = (await res.json()) as SeoResult;
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    void fetchSeo();
  }, [fetchSeo]);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <SearchCheck className="h-4 w-4 text-muted-foreground" />
            SEO Score
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-16 animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  if (error || !result) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <SearchCheck className="h-4 w-4 text-muted-foreground" />
            SEO Score
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{error ?? "Unable to load SEO analysis."}</p>
        </CardContent>
      </Card>
    );
  }

  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (result.score / 100) * circumference;
  const passedCount = result.checks.filter((c) => c.passed).length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <SearchCheck className="h-4 w-4 text-muted-foreground" />
            SEO Score
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? (
              <>
                Hide details <ChevronUp className="ml-1 h-3 w-3" />
              </>
            ) : (
              <>
                Details <ChevronDown className="ml-1 h-3 w-3" />
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-5">
          {/* Score ring */}
          <div className="relative shrink-0">
            <svg width="72" height="72" viewBox="0 0 72 72" className="-rotate-90">
              <circle
                cx="36"
                cy="36"
                r={radius}
                fill="none"
                strokeWidth="6"
                className="stroke-muted"
              />
              <circle
                cx="36"
                cy="36"
                r={radius}
                fill="none"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className={ringColor(result.score)}
                style={{ transition: "stroke-dashoffset 0.4s ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-lg font-bold leading-none ${scoreColor(result.score)}`}>
                {result.score}
              </span>
              <span className="text-[10px] text-muted-foreground mt-0.5">/ 100</span>
            </div>
          </div>

          {/* Summary */}
          <div className="min-w-0">
            <p className={`text-sm font-semibold ${scoreColor(result.score)}`}>{result.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {passedCount} of {result.checks.length} checks passed
            </p>
          </div>
        </div>

        {expanded && (
          <ul className="mt-4 space-y-2">
            {result.checks.map((check) => (
              <li key={check.id} className="flex items-start gap-2 text-xs">
                {check.passed ? (
                  <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-green-500" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-red-400" />
                )}
                <div>
                  <span className={check.passed ? "text-foreground font-medium" : "text-foreground"}>
                    {check.label}
                  </span>
                  {!check.passed && (
                    <p className="text-muted-foreground mt-0.5">{check.hint}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
