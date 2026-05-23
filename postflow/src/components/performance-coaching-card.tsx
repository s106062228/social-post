"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Brain,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  CheckCircle2,
  TrendingUp,
  Target,
  Sparkles,
} from "lucide-react";

interface CoachingInsight {
  id: string;
  weekOf: string;
  summary: string;
  highlights: string[];
  improvements: string[];
  nextWeekFocus: string;
  overallScore: number;
  createdAt: string;
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-yellow-600";
  if (score >= 40) return "text-orange-600";
  return "text-red-600";
}

function scoreLabel(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  return "Needs Attention";
}

function scoreBadgeVariant(score: number): "default" | "secondary" | "destructive" | "outline" {
  if (score >= 60) return "default";
  if (score >= 40) return "secondary";
  return "destructive";
}

export function PerformanceCoachingCard() {
  const [coaching, setCoaching] = useState<CoachingInsight | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [open, setOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCoaching = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/ai/performance-coaching");
      if (res.ok) {
        const data = (await res.json()) as { coaching: CoachingInsight | null };
        setCoaching(data.coaching);
      }
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCoaching();
  }, [fetchCoaching]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/performance-coaching", { method: "POST" });
      if (res.ok) {
        const data = (await res.json()) as { coaching: CoachingInsight };
        setCoaching(data.coaching);
      } else {
        const err = (await res.json()) as { error?: string };
        setError(err.error ?? "Failed to generate coaching insights");
      }
    } catch {
      setError("Failed to generate coaching insights");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-purple-500" />
              <CardTitle className="text-base">AI Performance Coaching</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerate}
                disabled={generating || loading}
              >
                {generating ? (
                  <RefreshCw className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-1" />
                )}
                {coaching ? "Regenerate" : "Generate Now"}
              </Button>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm">
                  {open ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
          <CardDescription>
            Personalised weekly insights to improve your content strategy
          </CardDescription>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="pt-0">
            {loading ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-4 bg-muted rounded w-1/2" />
                <div className="h-4 bg-muted rounded w-2/3" />
              </div>
            ) : error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : !coaching ? (
              <div className="text-center py-6 space-y-2">
                <Brain className="h-10 w-10 mx-auto text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  No coaching insights yet. Generate your first weekly report to get started.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Score */}
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <p className={`text-4xl font-bold ${scoreColor(coaching.overallScore)}`}>
                      {coaching.overallScore}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">/ 100</p>
                  </div>
                  <div>
                    <Badge variant={scoreBadgeVariant(coaching.overallScore)}>
                      {scoreLabel(coaching.overallScore)}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">
                      Week of {new Date(coaching.weekOf).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                </div>

                {/* Summary */}
                <p className="text-sm text-foreground">{coaching.summary}</p>

                {/* Highlights */}
                {coaching.highlights.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" /> What&apos;s Working
                    </h4>
                    <ul className="space-y-1.5">
                      {coaching.highlights.map((h, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                          <span>{h}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Improvements */}
                {coaching.improvements.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                      <Target className="h-3 w-3" /> Areas to Improve
                    </h4>
                    <ul className="space-y-1.5">
                      {coaching.improvements.map((imp, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold flex items-center justify-center mt-0.5 shrink-0">
                            {i + 1}
                          </span>
                          <span>{imp}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Next Week Focus */}
                <div className="rounded-lg border border-purple-100 dark:border-purple-900 bg-purple-50 dark:bg-purple-950/20 p-3">
                  <h4 className="text-xs font-semibold text-purple-700 dark:text-purple-400 uppercase tracking-wide mb-1 flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> Focus for Next Week
                  </h4>
                  <p className="text-sm text-purple-900 dark:text-purple-100">{coaching.nextWeekFocus}</p>
                </div>

                <p className="text-xs text-muted-foreground text-right">
                  Generated {new Date(coaching.createdAt).toLocaleDateString()}
                </p>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
