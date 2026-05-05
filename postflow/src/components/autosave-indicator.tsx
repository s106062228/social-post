"use client";

import { Loader2, Check, AlertCircle } from "lucide-react";

type SaveState = "idle" | "saving" | "saved" | "error";

interface AutosaveIndicatorProps {
  state: SaveState;
  savedAt: Date | null;
}

export function AutosaveIndicator({ state, savedAt }: AutosaveIndicatorProps) {
  if (state === "idle") return null;

  if (state === "saving") {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Saving draft…
      </span>
    );
  }

  if (state === "error") {
    return (
      <span className="flex items-center gap-1 text-xs text-destructive">
        <AlertCircle className="h-3 w-3" />
        Draft save failed
      </span>
    );
  }

  // saved
  const label = savedAt
    ? `Draft saved ${formatRelative(savedAt)}`
    : "Draft saved";

  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Check className="h-3 w-3 text-green-500" />
      {label}
    </span>
  );
}

function formatRelative(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}
