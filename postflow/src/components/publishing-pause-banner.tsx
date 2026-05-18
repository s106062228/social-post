"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PauseState {
  paused: boolean;
  reason: string | null;
  pausedAt: string | null;
}

export function PublishingPauseBanner() {
  const [state, setState] = useState<PauseState | null>(null);
  const [resuming, setResuming] = useState(false);

  useEffect(() => {
    fetch("/api/settings/publishing-pause")
      .then((r) => r.json() as Promise<PauseState>)
      .then((data) => setState(data))
      .catch(() => {
        // Fail silently — banner is non-critical
      });
  }, []);

  if (!state?.paused) return null;

  const pausedAt = state.pausedAt ? new Date(state.pausedAt) : null;
  const formattedTime = pausedAt
    ? pausedAt.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  async function handleResume() {
    setResuming(true);
    try {
      const res = await fetch("/api/settings/publishing-pause", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: false }),
      });
      if (res.ok) {
        setState({ paused: false, reason: null, pausedAt: null });
      }
    } finally {
      setResuming(false);
    }
  }

  return (
    <div className="flex items-center gap-3 bg-destructive px-6 py-2.5 text-sm text-destructive-foreground">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="flex-1">
        <strong>Publishing is paused.</strong>
        {state.reason && <span className="ml-1">{state.reason}</span>}
        {formattedTime && (
          <span className="ml-1 opacity-80">Paused since {formattedTime}.</span>
        )}
        <span className="ml-1 opacity-80">
          New jobs will be re-queued and retried every 30 minutes.
        </span>
      </span>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => void handleResume()}
        disabled={resuming}
        className="shrink-0"
      >
        <X className="mr-1 h-3 w-3" />
        {resuming ? "Resuming…" : "Resume Publishing"}
      </Button>
    </div>
  );
}
