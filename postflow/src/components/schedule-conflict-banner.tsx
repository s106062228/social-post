"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ConflictResponse {
  conflicts: Array<{
    postAId: string;
    postBId: string;
    platform: string;
    overlapMinutes: number;
  }>;
  totalConflicts: number;
}

interface ScheduleConflictBannerProps {
  onResolved?: () => void;
}

export function ScheduleConflictBanner({ onResolved }: ScheduleConflictBannerProps) {
  const [data, setData] = useState<ConflictResponse | null>(null);
  const [resolving, setResolving] = useState(false);

  const fetchConflicts = useCallback(() => {
    fetch("/api/posts/schedule-conflicts")
      .then((r) => r.json() as Promise<ConflictResponse>)
      .then(setData)
      .catch(() => {
        // Fail silently — banner is non-critical
      });
  }, []);

  useEffect(() => {
    fetchConflicts();
  }, [fetchConflicts]);

  if (!data || data.totalConflicts === 0) return null;

  const platformCounts = data.conflicts.reduce<Record<string, number>>((acc, c) => {
    const key = c.platform === "any" ? "Multiple platforms" : c.platform;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const platformSummary = Object.entries(platformCounts)
    .map(([p, n]) => `${n} on ${p}`)
    .join(", ");

  async function handleAutoResolve() {
    setResolving(true);
    try {
      const res = await fetch("/api/posts/resolve-conflicts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ windowMinutes: 30, spacingMinutes: 30 }),
      });
      if (res.ok) {
        const result = (await res.json()) as { resolved: number };
        setData(null);
        onResolved?.();
        // Brief toast-like feedback via console (real UI uses parent toast)
        console.info(`Resolved ${result.resolved} scheduling conflicts`);
      }
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="flex items-center gap-3 bg-amber-500 px-6 py-2.5 text-sm text-white dark:bg-amber-600">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="flex-1">
        <strong>
          {data.totalConflicts} scheduling conflict{data.totalConflicts > 1 ? "s" : ""} detected.
        </strong>
        {platformSummary && (
          <span className="ml-1 opacity-90">({platformSummary})</span>
        )}
        <span className="ml-1 opacity-80">
          Posts are scheduled too close together and may exceed platform rate limits.
        </span>
      </span>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => void handleAutoResolve()}
        disabled={resolving}
        className="shrink-0 bg-white/20 text-white hover:bg-white/30 border-0"
      >
        <Zap className="mr-1 h-3 w-3" />
        {resolving ? "Resolving…" : "Auto-Resolve"}
      </Button>
    </div>
  );
}
