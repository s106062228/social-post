"use client";

import { useState } from "react";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ParsedDateResult {
  datetime: string;
  confidence: number;
  interpretation: string;
}

interface NaturalLanguageSchedulerProps {
  onDateParsed: (datetimeLocal: string) => void;
  timezone?: string;
}

function utcToDatetimeLocal(utcIso: string): string {
  const date = new Date(utcIso);
  if (isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

export function NaturalLanguageScheduler({
  onDateParsed,
  timezone,
}: NaturalLanguageSchedulerProps) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParsedDateResult | null>(null);
  const [expanded, setExpanded] = useState(false);

  async function handleParse() {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const body: { text: string; timezone?: string } = { text: text.trim() };
      if (timezone) body.timezone = timezone;
      const res = await fetch("/api/ai/parse-date", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as ParsedDateResult & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not parse the date");
        return;
      }
      setResult(data);
    } catch {
      setError("Failed to connect to AI service");
    } finally {
      setLoading(false);
    }
  }

  function handleApply() {
    if (!result) return;
    const local = utcToDatetimeLocal(result.datetime);
    if (local) {
      onDateParsed(local);
      setText("");
      setResult(null);
      setExpanded(false);
    }
  }

  function handleClear() {
    setText("");
    setResult(null);
    setError(null);
    setExpanded(false);
  }

  if (!expanded) {
    return (
      <button
        type="button"
        className="text-xs text-muted-foreground underline-offset-2 hover:underline hover:text-foreground transition-colors"
        onClick={() => setExpanded(true)}
      >
        or describe a time naturally
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed border-border p-3 bg-muted/30">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          <Sparkles className="h-3 w-3" />
          Describe the time
        </span>
        <button
          type="button"
          onClick={handleClear}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <Input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
            setResult(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleParse();
            }
          }}
          placeholder="e.g. next Monday at 3pm, tomorrow morning, in 2 hours"
          className="flex-1 h-8 text-sm"
          disabled={loading}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => void handleParse()}
          disabled={loading || !text.trim()}
          className="h-8 shrink-0"
        >
          {loading ? "Parsing…" : "Parse"}
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {result && (
        <div className="flex items-center justify-between gap-2 rounded-sm bg-background border border-border px-2 py-1.5">
          <div className="flex flex-col min-w-0">
            <span className="text-xs text-foreground font-medium truncate">
              {result.interpretation}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {new Date(result.datetime).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
              {result.confidence < 0.7 && (
                <span className="ml-1 text-amber-500">(low confidence)</span>
              )}
            </span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="default"
            onClick={handleApply}
            className="h-7 text-xs shrink-0"
          >
            Use this time
          </Button>
        </div>
      )}
    </div>
  );
}
