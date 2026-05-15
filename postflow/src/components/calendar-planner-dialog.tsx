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
import { Sparkles, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface CalendarSuggestion {
  platform: string;
  contentType: string;
  draft: string;
  reasoning: string;
  accepted?: boolean;
}

interface CalendarDay {
  date: string;
  suggestions: CalendarSuggestion[];
}

const AVAILABLE_PLATFORMS = [
  "FACEBOOK",
  "INSTAGRAM",
  "THREADS",
  "TWITTER",
  "LINKEDIN",
  "BLUESKY",
  "MASTODON",
];

const TONE_OPTIONS = [
  { value: "", label: "Default" },
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual" },
  { value: "humorous", label: "Humorous" },
  { value: "inspirational", label: "Inspirational" },
  { value: "educational", label: "Educational" },
];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function platformLabel(platform: string): string {
  const labels: Record<string, string> = {
    FACEBOOK: "Facebook",
    INSTAGRAM: "Instagram",
    THREADS: "Threads",
    TWITTER: "X (Twitter)",
    LINKEDIN: "LinkedIn",
    BLUESKY: "Bluesky",
    MASTODON: "Mastodon",
    YOUTUBE: "YouTube",
    TIKTOK: "TikTok",
    PINTEREST: "Pinterest",
    REDDIT: "Reddit",
  };
  return labels[platform] ?? platform;
}

export function CalendarPlannerDialog({ onPostsCreated }: { onPostsCreated?: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [days, setDays] = useState<CalendarDay[]>([]);
  const [generated, setGenerated] = useState(false);

  const today = new Date().toISOString().split("T")[0];
  const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(nextMonth);
  const [postsPerWeek, setPostsPerWeek] = useState(3);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["INSTAGRAM", "FACEBOOK"]);
  const [tone, setTone] = useState("");

  function togglePlatform(platform: string) {
    setSelectedPlatforms((prev) =>
      prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform]
    );
  }

  function toggleSuggestion(dayIdx: number, suggIdx: number) {
    setDays((prev) =>
      prev.map((day, di) => {
        if (di !== dayIdx) return day;
        return {
          ...day,
          suggestions: day.suggestions.map((s, si) => {
            if (si !== suggIdx) return s;
            return { ...s, accepted: !s.accepted };
          }),
        };
      })
    );
  }

  async function generate() {
    if (selectedPlatforms.length === 0) {
      toast.error("Select at least one platform");
      return;
    }
    setLoading(true);
    setGenerated(false);
    setDays([]);
    try {
      const res = await fetch("/api/ai/content-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate, postsPerWeek, platforms: selectedPlatforms, tone: tone || undefined }),
      });
      const data = (await res.json()) as { days?: CalendarDay[]; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Failed to generate calendar");
        return;
      }
      const daysWithAccepted = (data.days ?? []).map((day) => ({
        ...day,
        suggestions: day.suggestions.map((s) => ({ ...s, accepted: true })),
      }));
      setDays(daysWithAccepted);
      setGenerated(true);
    } catch {
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function createPosts() {
    const toCreate: { content: string; scheduledAt: string }[] = [];
    for (const day of days) {
      for (const s of day.suggestions) {
        if (s.accepted) {
          toCreate.push({ content: s.draft, scheduledAt: `${day.date}T12:00:00.000Z` });
        }
      }
    }
    if (toCreate.length === 0) {
      toast.error("No suggestions selected");
      return;
    }
    setCreating(true);
    let successCount = 0;
    let failCount = 0;
    for (const item of toCreate) {
      try {
        const res = await fetch("/api/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: item.content,
            mediaType: "NONE",
            mediaUrls: [],
            scheduledAt: item.scheduledAt,
          }),
        });
        if (res.ok) successCount++;
        else failCount++;
      } catch {
        failCount++;
      }
    }
    setCreating(false);
    if (successCount > 0) {
      toast.success(`Created ${successCount} draft post${successCount === 1 ? "" : "s"}`);
      onPostsCreated?.();
    }
    if (failCount > 0) {
      toast.error(`Failed to create ${failCount} post${failCount === 1 ? "" : "s"}`);
    }
    if (successCount > 0) {
      setOpen(false);
      setGenerated(false);
      setDays([]);
    }
  }

  const acceptedCount = days.flatMap((d) => d.suggestions).filter((s) => s.accepted).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Sparkles className="mr-2 h-4 w-4" />
          AI Plan
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>AI Content Calendar Planner</DialogTitle>
        </DialogHeader>

        {!generated ? (
          <div className="flex flex-col gap-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Posts per week</label>
              <input
                type="number"
                min={1}
                max={21}
                value={postsPerWeek}
                onChange={(e) => setPostsPerWeek(Math.max(1, Math.min(21, Number(e.target.value))))}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Tone</label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {TONE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">Platforms</label>
              <div className="mt-1 flex flex-wrap gap-2">
                {AVAILABLE_PLATFORMS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePlatform(p)}
                    className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                      selectedPlatforms.includes(p)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-foreground border-input hover:bg-muted"
                    }`}
                  >
                    {platformLabel(p)}
                  </button>
                ))}
              </div>
            </div>

            <Button onClick={generate} disabled={loading || selectedPlatforms.length === 0}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Plan
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 mt-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {acceptedCount} suggestion{acceptedCount === 1 ? "" : "s"} selected
              </p>
              <Button variant="outline" size="sm" onClick={() => setGenerated(false)}>
                Regenerate
              </Button>
            </div>

            <div className="flex flex-col gap-4">
              {days.map((day, dayIdx) => (
                <div key={day.date} className="border rounded-lg p-3">
                  <h3 className="text-sm font-semibold mb-2">{formatDate(day.date)}</h3>
                  <div className="flex flex-col gap-2">
                    {day.suggestions.map((s, si) => (
                      <div
                        key={si}
                        className={`rounded-md border p-3 text-sm transition-colors ${
                          s.accepted ? "border-primary bg-primary/5" : "border-muted bg-muted/30"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-xs text-muted-foreground uppercase">
                                {platformLabel(s.platform)} · {s.contentType}
                              </span>
                            </div>
                            <p className="text-sm leading-snug">{s.draft}</p>
                            <p className="mt-1 text-xs text-muted-foreground italic">{s.reasoning}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleSuggestion(dayIdx, si)}
                            className={`shrink-0 rounded-full p-1 transition-colors ${
                              s.accepted
                                ? "text-primary hover:text-muted-foreground"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                            title={s.accepted ? "Deselect" : "Select"}
                          >
                            {s.accepted ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {days.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No suggestions generated. Try adjusting your parameters.
              </p>
            )}

            <div className="flex gap-2 justify-end pt-2 border-t">
              <Button variant="outline" onClick={() => { setGenerated(false); setDays([]); }}>
                Back
              </Button>
              <Button
                onClick={createPosts}
                disabled={creating || acceptedCount === 0}
              >
                {creating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating…
                  </>
                ) : (
                  `Create ${acceptedCount} Draft Post${acceptedCount === 1 ? "" : "s"}`
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
