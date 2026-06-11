"use client";

import { useState } from "react";
import { Sparkles, Loader2, TrendingUp, AlertTriangle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface IdeaScoreDimension {
  name: string;
  score: number;
  explanation: string;
}

interface IdeaScoreResult {
  overallScore: number;
  dimensions: IdeaScoreDimension[];
  topStrengths: string[];
  topWeaknesses: string[];
  recommendation: "pursue" | "refine" | "skip";
}

interface IdeaScoringDialogProps {
  ideaId: string;
  ideaTitle: string;
  ideaDescription?: string | null;
  platforms?: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScoreSaved?: (score: number) => void;
}

const RECOMMENDATION_CONFIG = {
  pursue: {
    label: "Pursue",
    color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    icon: CheckCircle,
    description: "This idea has strong potential. Move forward with confidence.",
  },
  refine: {
    label: "Refine",
    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    icon: TrendingUp,
    description: "This idea has merit but needs improvement before execution.",
  },
  skip: {
    label: "Skip",
    color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    icon: AlertTriangle,
    description: "This idea may not resonate well. Consider a different angle.",
  },
};

function ScoreRing({ score }: { score: number }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const filled = (score / 100) * circumference;
  const color =
    score >= 70 ? "#22c55e" : score >= 40 ? "#eab308" : "#ef4444";

  return (
    <div className="relative flex items-center justify-center w-24 h-24">
      <svg className="absolute" width="96" height="96" viewBox="0 0 96 96">
        <circle
          cx="48"
          cy="48"
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-muted/20"
          strokeWidth="8"
        />
        <circle
          cx="48"
          cy="48"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={`${filled} ${circumference}`}
          strokeLinecap="round"
          transform="rotate(-90 48 48)"
        />
      </svg>
      <span className="text-2xl font-bold">{score}</span>
    </div>
  );
}

export function IdeaScoringDialog({
  ideaId,
  ideaTitle,
  ideaDescription,
  platforms = ["FACEBOOK", "INSTAGRAM", "THREADS"],
  open,
  onOpenChange,
  onScoreSaved,
}: IdeaScoringDialogProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IdeaScoreResult | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleScore() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/ai/score-idea", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: ideaTitle,
          description: ideaDescription ?? undefined,
          platforms: platforms.length > 0 ? platforms : ["FACEBOOK"],
        }),
      });
      if (res.status === 503) {
        toast.error("AI features are not configured");
        return;
      }
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        toast.error(err.error ?? "Scoring failed");
        return;
      }
      const data = (await res.json()) as { score: IdeaScoreResult };
      setResult(data.score);
    } catch {
      toast.error("Failed to score idea");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveScore() {
    if (!result) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/ideas/${ideaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score: result.overallScore }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success("Score saved to idea");
      onScoreSaved?.(result.overallScore);
    } catch {
      toast.error("Failed to save score");
    } finally {
      setSaving(false);
    }
  }

  function handleOpenChange(newOpen: boolean) {
    onOpenChange(newOpen);
    if (!newOpen) {
      setResult(null);
    }
  }

  const rec = result ? RECOMMENDATION_CONFIG[result.recommendation] : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            AI Idea Scoring
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Idea being scored */}
          <div className="rounded-md bg-muted/50 px-3 py-2">
            <p className="text-sm font-medium line-clamp-2">{ideaTitle}</p>
            {ideaDescription && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                {ideaDescription}
              </p>
            )}
          </div>

          {/* Score result */}
          {result && rec ? (
            <div className="space-y-4">
              {/* Overall score + recommendation */}
              <div className="flex items-center gap-4">
                <ScoreRing score={result.overallScore} />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">Overall Score</span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${rec.color}`}
                    >
                      <rec.icon className="h-3 w-3" />
                      {rec.label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{rec.description}</p>
                </div>
              </div>

              {/* Dimensions */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                  Dimensions
                </p>
                {result.dimensions.map((dim) => (
                  <div key={dim.name} className="space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">{dim.name}</span>
                      <span
                        className={`text-xs font-bold ${
                          dim.score >= 70
                            ? "text-green-600 dark:text-green-400"
                            : dim.score >= 40
                            ? "text-yellow-600 dark:text-yellow-400"
                            : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        {dim.score}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          dim.score >= 70
                            ? "bg-green-500"
                            : dim.score >= 40
                            ? "bg-yellow-500"
                            : "bg-red-500"
                        }`}
                        style={{ width: `${dim.score}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {dim.explanation}
                    </p>
                  </div>
                ))}
              </div>

              {/* Strengths & Weaknesses */}
              {(result.topStrengths.length > 0 || result.topWeaknesses.length > 0) && (
                <div className="grid grid-cols-2 gap-3">
                  {result.topStrengths.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-green-600 dark:text-green-400">
                        Strengths
                      </p>
                      <ul className="space-y-0.5">
                        {result.topStrengths.map((s, i) => (
                          <li key={i} className="text-xs text-muted-foreground flex gap-1">
                            <span className="text-green-500 shrink-0">+</span>
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {result.topWeaknesses.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-red-600 dark:text-red-400">
                        Weaknesses
                      </p>
                      <ul className="space-y-0.5">
                        {result.topWeaknesses.map((w, i) => (
                          <li key={i} className="text-xs text-muted-foreground flex gap-1">
                            <span className="text-red-500 shrink-0">−</span>
                            {w}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={handleScore} variant="outline" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                  Regenerate
                </Button>
                <Button size="sm" onClick={handleSaveScore} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                  Save Score
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              {loading ? (
                <>
                  <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
                  <p className="text-sm text-muted-foreground">
                    Scoring your idea with AI…
                  </p>
                </>
              ) : (
                <>
                  <Sparkles className="h-8 w-8 text-purple-400" />
                  <p className="text-sm text-muted-foreground">
                    Get an AI-powered assessment of this idea&apos;s potential across
                    originality, brand fit, audience interest, timeliness, and estimated
                    engagement.
                  </p>
                  <Button onClick={handleScore} className="mt-1">
                    <Sparkles className="mr-2 h-4 w-4" />
                    Score Idea
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
