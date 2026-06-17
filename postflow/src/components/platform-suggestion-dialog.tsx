"use client";

import { useState } from "react";
import { Sparkles, Loader2, CheckCircle2, TrendingUp } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

interface PlatformSuggestion {
  platform: string;
  score: number;
  reasoning: string;
  bestForAudience: string;
  tips: string[];
}

interface PlatformSuggestionDialogProps {
  open: boolean;
  onClose: () => void;
  content: string;
  mediaType: "NONE" | "IMAGE" | "VIDEO" | "CAROUSEL";
  availablePlatforms: string[];
  onSuggest: (platforms: string[]) => void;
}

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 75
      ? "bg-green-500"
      : score >= 50
      ? "bg-yellow-500"
      : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="w-8 text-right text-xs font-semibold text-foreground">
        {score}
      </span>
    </div>
  );
}

export function PlatformSuggestionDialog({
  open,
  onClose,
  content,
  mediaType,
  availablePlatforms,
  onSuggest,
}: PlatformSuggestionDialogProps) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<PlatformSuggestion[]>([]);
  const [overallStrategy, setOverallStrategy] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(
    new Set()
  );
  const [hasResults, setHasResults] = useState(false);

  async function fetchSuggestions() {
    if (!content.trim() || availablePlatforms.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ai/suggest-platforms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          mediaType,
          platforms: availablePlatforms,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        toast({
          title: "Error",
          description: data.error ?? "Failed to get platform suggestions",
          variant: "destructive",
        });
        return;
      }
      const data = (await res.json()) as {
        suggestions: PlatformSuggestion[];
        overallStrategy: string;
      };
      setSuggestions(data.suggestions ?? []);
      setOverallStrategy(data.overallStrategy ?? "");
      // Pre-select platforms with score >= 60
      const autoSelected = new Set(
        (data.suggestions ?? [])
          .filter((s) => s.score >= 60)
          .map((s) => s.platform)
      );
      setSelectedPlatforms(autoSelected);
      setHasResults(true);
    } catch {
      toast({
        title: "Error",
        description: "Failed to get platform suggestions",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  function togglePlatform(platform: string) {
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) {
        next.delete(platform);
      } else {
        next.add(platform);
      }
      return next;
    });
  }

  function handleApply() {
    if (selectedPlatforms.size === 0) {
      toast({
        title: "No platforms selected",
        description: "Select at least one platform to apply.",
        variant: "destructive",
      });
      return;
    }
    onSuggest(Array.from(selectedPlatforms));
    onClose();
  }

  function handleClose() {
    setSuggestions([]);
    setOverallStrategy("");
    setSelectedPlatforms(new Set());
    setHasResults(false);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Platform Suggestions
          </DialogTitle>
          <DialogDescription>
            Get AI-powered recommendations on which platforms would perform best
            for your content.
          </DialogDescription>
        </DialogHeader>

        {!hasResults ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="text-center text-sm text-muted-foreground max-w-md">
              Analyze your post content and get personalized recommendations for
              which of your connected platforms would work best.
            </div>
            <Button
              onClick={() => void fetchSuggestions()}
              disabled={loading || !content.trim() || availablePlatforms.length === 0}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing…
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Suggest Best Platforms
                </>
              )}
            </Button>
            {availablePlatforms.length === 0 && (
              <p className="text-xs text-destructive">
                No platforms available. Connect accounts first.
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {overallStrategy && (
              <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3">
                <div className="flex items-start gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    {overallStrategy}
                  </p>
                </div>
              </div>
            )}

            <div className="text-sm text-muted-foreground">
              Platforms with a score ≥ 60 are pre-selected. Click to
              toggle.
            </div>

            <div className="flex flex-col gap-3">
              {suggestions.map((suggestion) => {
                const selected = selectedPlatforms.has(suggestion.platform);
                return (
                  <div
                    key={suggestion.platform}
                    onClick={() => togglePlatform(suggestion.platform)}
                    className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                      selected
                        ? "border-primary bg-primary/5"
                        : "border-input hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {selected && (
                          <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                        )}
                        <span className="font-medium text-sm">
                          {suggestion.platform}
                        </span>
                      </div>
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          suggestion.score >= 75
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : suggestion.score >= 50
                            ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        }`}
                      >
                        Score: {suggestion.score}
                      </span>
                    </div>
                    <ScoreBar score={suggestion.score} />
                    <p className="mt-2 text-xs text-muted-foreground">
                      {suggestion.reasoning}
                    </p>
                    {suggestion.bestForAudience && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        <span className="font-medium">Best for:</span>{" "}
                        {suggestion.bestForAudience}
                      </p>
                    )}
                    {suggestion.tips && suggestion.tips.length > 0 && (
                      <ul className="mt-2 space-y-0.5">
                        {suggestion.tips.map((tip, i) => (
                          <li
                            key={i}
                            className="text-xs text-muted-foreground flex items-start gap-1"
                          >
                            <span className="text-primary mt-0.5">•</span>
                            {tip}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <button
                type="button"
                onClick={() => void fetchSuggestions()}
                disabled={loading}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                {loading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                Regenerate
              </button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleApply}
                  disabled={selectedPlatforms.size === 0}
                >
                  Apply ({selectedPlatforms.size} platform
                  {selectedPlatforms.size !== 1 ? "s" : ""})
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
