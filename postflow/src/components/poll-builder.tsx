"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BarChart2, ChevronDown, ChevronUp, Plus, X } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PollData {
  question: string;
  options: string[];
  durationHours: number;
}

interface PollBuilderProps {
  poll: PollData | null;
  onChange: (poll: PollData | null) => void;
  /** Array of Platform enum values currently selected by the user */
  selectedPlatforms: string[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const POLL_SUPPORTED_PLATFORMS = new Set(["TWITTER", "LINKEDIN"]);

const DURATION_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "1 hour" },
  { value: 6, label: "6 hours" },
  { value: 24, label: "24 hours (1 day)" },
  { value: 72, label: "72 hours (3 days)" },
  { value: 168, label: "168 hours (1 week)" },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function PollBuilder({ poll, onChange, selectedPlatforms }: PollBuilderProps) {
  const [expanded, setExpanded] = useState(false);

  // Only show when at least one poll-supported platform is selected
  const isVisible = selectedPlatforms.some((p) => POLL_SUPPORTED_PLATFORMS.has(p));
  if (!isVisible) return null;

  const isEnabled = poll !== null;

  function enable() {
    onChange({
      question: "",
      options: ["", ""],
      durationHours: 24,
    });
    setExpanded(true);
  }

  function disable() {
    onChange(null);
    setExpanded(false);
  }

  function updateQuestion(value: string) {
    if (!poll) return;
    onChange({ ...poll, question: value });
  }

  function updateOption(index: number, value: string) {
    if (!poll) return;
    const next = [...poll.options];
    next[index] = value;
    onChange({ ...poll, options: next });
  }

  function addOption() {
    if (!poll || poll.options.length >= 4) return;
    onChange({ ...poll, options: [...poll.options, ""] });
  }

  function removeOption(index: number) {
    if (!poll || poll.options.length <= 2) return;
    const next = poll.options.filter((_, i) => i !== index);
    onChange({ ...poll, options: next });
  }

  function updateDuration(value: string) {
    if (!poll) return;
    onChange({ ...poll, durationHours: parseInt(value, 10) });
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Header toggle */}
      <button
        type="button"
        onClick={() => {
          if (!isEnabled) {
            enable();
          } else if (expanded) {
            setExpanded(false);
          } else {
            setExpanded(true);
          }
        }}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors rounded-lg"
      >
        <span className="flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-muted-foreground" />
          Add Poll
          {isEnabled && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              On
            </span>
          )}
        </span>
        <span className="flex items-center gap-2">
          {isEnabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                disable();
              }}
              className="rounded-md p-1 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              aria-label="Remove poll"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </span>
      </button>

      {/* Poll builder form */}
      {isEnabled && expanded && poll && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
          {/* Question */}
          <div className="space-y-1">
            <Label htmlFor="poll-question" className="text-xs text-muted-foreground">
              Question
              <span className="ml-1 text-muted-foreground/70">
                ({poll.question.length}/140)
              </span>
            </Label>
            <Textarea
              id="poll-question"
              value={poll.question}
              onChange={(e) => updateQuestion(e.target.value)}
              maxLength={140}
              placeholder="Ask a question…"
              rows={2}
              className="resize-none text-sm"
            />
          </div>

          {/* Options */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Options
              <span className="ml-1 text-muted-foreground/70">(2–4)</span>
            </Label>
            {poll.options.map((option, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-5 shrink-0 text-right">
                  {idx + 1}.
                </span>
                <Input
                  value={option}
                  onChange={(e) => updateOption(idx, e.target.value)}
                  maxLength={25}
                  placeholder={`Option ${idx + 1}`}
                  className="text-sm"
                />
                <span className="text-xs text-muted-foreground w-12 shrink-0 text-right">
                  {option.length}/25
                </span>
                {poll.options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeOption(idx)}
                    className="rounded-md p-1 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    aria-label={`Remove option ${idx + 1}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}

            {poll.options.length < 4 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1 px-2 text-muted-foreground"
                onClick={addOption}
              >
                <Plus className="h-3.5 w-3.5" />
                Add option
              </Button>
            )}
          </div>

          {/* Duration */}
          <div className="space-y-1">
            <Label htmlFor="poll-duration" className="text-xs text-muted-foreground">
              Poll duration
            </Label>
            <select
              id="poll-duration"
              value={String(poll.durationHours)}
              onChange={(e) => updateDuration(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring w-48"
            >
              {DURATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={String(opt.value)}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <p className="text-xs text-muted-foreground">
            Polls are published to X (Twitter) and LinkedIn. Media will be omitted when a poll is attached.
          </p>
        </div>
      )}
    </div>
  );
}
