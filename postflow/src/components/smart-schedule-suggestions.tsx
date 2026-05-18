"use client";

import { useState } from "react";
import { Loader2, Sparkles, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import type { Platform } from "@prisma/client";

interface Suggestion {
  datetime: string;
  dayLabel: string;
  timeLabel: string;
  reason: string;
  score: number;
}

interface SmartScheduleSuggestionsProps {
  selectedPlatforms: Platform[];
  onSelect: (datetimeLocal: string) => void;
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

export function SmartScheduleSuggestions({
  selectedPlatforms,
  onSelect,
}: SmartScheduleSuggestionsProps) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);

  async function fetchSuggestions() {
    setLoading(true);
    setSuggestions(null);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
      const res = await fetch("/api/posts/suggest-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platforms: selectedPlatforms, timezone }),
      });
      if (!res.ok) throw new Error("Failed to fetch suggestions");
      const data = (await res.json()) as { suggestions: Suggestion[] };
      setSuggestions(data.suggestions);
      if (data.suggestions.length === 0) {
        toast({
          title: "No suggestions yet",
          description:
            "Publish more posts and sync insights to get smart scheduling recommendations.",
        });
      }
    } catch {
      toast({ title: "Could not load suggestions", variant: "destructive" });
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }

  function handleSelect(suggestion: Suggestion) {
    onSelect(toDatetimeLocal(suggestion.datetime));
    setSuggestions(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs text-muted-foreground self-start"
        onClick={fetchSuggestions}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
        )}
        Suggest time
      </Button>

      {suggestions !== null && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s.datetime}
              type="button"
              onClick={() => handleSelect(s)}
              title={s.reason}
              className="flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs hover:bg-accent transition-colors"
            >
              <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="font-medium">{s.dayLabel}</span>
              <span className="text-muted-foreground">{s.timeLabel}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
