"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { CalendarCheck, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { CalendarGapResult } from "@/lib/calendar-gaps";

interface GapSuggestion {
  date: string;
  content: string;
  platform: string;
  reasoning: string;
  accepted?: boolean;
}

const PLATFORM_OPTIONS = [
  { value: "FACEBOOK", label: "Facebook" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "THREADS", label: "Threads" },
  { value: "TWITTER", label: "X (Twitter)" },
  { value: "LINKEDIN", label: "LinkedIn" },
  { value: "BLUESKY", label: "Bluesky" },
];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function CalendarGapFillerDialog() {
  const [open, setOpen] = useState(false);
  const [loadingGaps, setLoadingGaps] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [creatingPosts, setCreatingPosts] = useState(false);
  const [gapResult, setGapResult] = useState<CalendarGapResult | null>(null);
  const [suggestions, setSuggestions] = useState<GapSuggestion[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([
    "FACEBOOK",
    "INSTAGRAM",
    "THREADS",
  ]);

  async function fetchGaps() {
    setLoadingGaps(true);
    setGapResult(null);
    setSuggestions([]);
    try {
      const res = await fetch("/api/analytics/calendar-gaps?windowDays=14");
      if (!res.ok) throw new Error("Failed to fetch gap analysis");
      const data = (await res.json()) as CalendarGapResult & {
        windowDays: number;
      };
      setGapResult(data);
    } catch {
      toast.error("Failed to load calendar gap analysis");
    } finally {
      setLoadingGaps(false);
    }
  }

  function handleOpen(isOpen: boolean) {
    setOpen(isOpen);
    if (isOpen) {
      void fetchGaps();
    } else {
      setGapResult(null);
      setSuggestions([]);
    }
  }

  function togglePlatform(platform: string) {
    setSelectedPlatforms((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform]
    );
  }

  async function generateSuggestions() {
    if (!gapResult || gapResult.totalGaps === 0) return;
    if (selectedPlatforms.length === 0) {
      toast.error("Please select at least one platform");
      return;
    }

    const gapDates = gapResult.gaps.slice(0, 7).map((g) => g.date);
    setLoadingSuggestions(true);
    setSuggestions([]);
    try {
      const res = await fetch("/api/ai/fill-gaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gapDates, platforms: selectedPlatforms }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "Failed to generate suggestions");
      }
      const data = (await res.json()) as { suggestions: GapSuggestion[] };
      setSuggestions(data.suggestions.map((s) => ({ ...s, accepted: true })));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate suggestions");
    } finally {
      setLoadingSuggestions(false);
    }
  }

  function toggleAccepted(index: number) {
    setSuggestions((prev) =>
      prev.map((s, i) => (i === index ? { ...s, accepted: !s.accepted } : s))
    );
  }

  async function createDraftPosts() {
    const accepted = suggestions.filter((s) => s.accepted);
    if (accepted.length === 0) {
      toast.error("No suggestions selected");
      return;
    }
    setCreatingPosts(true);
    let created = 0;
    let failed = 0;
    for (const s of accepted) {
      try {
        const res = await fetch("/api/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: s.content,
            mediaType: "NONE",
            status: "DRAFT",
          }),
        });
        if (res.ok) {
          created++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }
    setCreatingPosts(false);
    if (created > 0) {
      toast.success(
        `Created ${created} draft post${created !== 1 ? "s" : ""}${failed > 0 ? ` (${failed} failed)` : ""}`
      );
      setOpen(false);
    } else {
      toast.error("Failed to create draft posts");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <CalendarCheck className="mr-2 h-4 w-4" />
          Fill Gaps
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Smart Calendar Gap Filler</DialogTitle>
        </DialogHeader>

        {loadingGaps && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">
              Analyzing your calendar...
            </span>
          </div>
        )}

        {!loadingGaps && gapResult && (
          <div className="flex flex-col gap-4">
            {/* Gap summary */}
            <div className="rounded-lg border bg-muted/30 p-4">
              {gapResult.totalGaps === 0 ? (
                <div className="flex items-center gap-2 text-green-600">
                  <CalendarCheck className="h-5 w-5" />
                  <span className="font-medium">
                    Your calendar is fully covered for the next 14 days!
                  </span>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <Badge variant="destructive">
                      {gapResult.totalGaps} gap
                      {gapResult.totalGaps !== 1 ? "s" : ""} found
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {gapResult.gapRate}% of the next 14 days have no
                      scheduled posts
                    </span>
                  </div>
                  {gapResult.longestStreakDays > 1 && (
                    <p className="text-sm text-muted-foreground">
                      Longest streak without posts:{" "}
                      <strong>{gapResult.longestStreakDays} days</strong>
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1 mt-1">
                    {gapResult.gaps.slice(0, 7).map((gap) => (
                      <Badge key={gap.date} variant="outline" className="text-xs">
                        {formatDate(gap.date)}
                        {gap.isWeekend && " (weekend)"}
                      </Badge>
                    ))}
                    {gapResult.gaps.length > 7 && (
                      <Badge variant="outline" className="text-xs">
                        +{gapResult.gaps.length - 7} more
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </div>

            {gapResult.totalGaps > 0 && (
              <>
                {/* Platform selector */}
                <div>
                  <p className="text-sm font-medium mb-2">
                    Target platforms for suggestions:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {PLATFORM_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => togglePlatform(opt.value)}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                          selectedPlatforms.includes(opt.value)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background border-border text-muted-foreground hover:border-primary"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <Button
                  onClick={() => void generateSuggestions()}
                  disabled={
                    loadingSuggestions || selectedPlatforms.length === 0
                  }
                >
                  {loadingSuggestions ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  Generate AI Suggestions
                </Button>
              </>
            )}

            {/* Suggestions */}
            {suggestions.length > 0 && (
              <div className="flex flex-col gap-3">
                <p className="text-sm font-medium">
                  AI suggestions (click to toggle selection):
                </p>
                {suggestions.map((s, i) => (
                  <div
                    key={i}
                    onClick={() => toggleAccepted(i)}
                    className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                      s.accepted
                        ? "border-primary bg-primary/5"
                        : "border-border opacity-50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {formatDate(s.date)}
                        </Badge>
                        <Badge className="text-xs">{s.platform}</Badge>
                      </div>
                      {s.accepted && (
                        <Badge className="text-xs bg-green-600">Selected</Badge>
                      )}
                    </div>
                    <p className="text-sm mt-1">{s.content}</p>
                    <p className="text-xs text-muted-foreground mt-1 italic">
                      {s.reasoning}
                    </p>
                  </div>
                ))}

                <Button
                  onClick={() => void createDraftPosts()}
                  disabled={
                    creatingPosts ||
                    suggestions.filter((s) => s.accepted).length === 0
                  }
                >
                  {creatingPosts ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CalendarCheck className="mr-2 h-4 w-4" />
                  )}
                  Create{" "}
                  {suggestions.filter((s) => s.accepted).length > 0
                    ? `${suggestions.filter((s) => s.accepted).length} `
                    : ""}
                  Draft Post
                  {suggestions.filter((s) => s.accepted).length !== 1
                    ? "s"
                    : ""}
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
