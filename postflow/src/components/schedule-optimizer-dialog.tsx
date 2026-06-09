"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TrendingUp, Wand2 } from "lucide-react";
import { toast } from "sonner";
import type { OptimizeScheduleResponse } from "@/app/api/posts/optimize-schedule/route";

type Proposal = OptimizeScheduleResponse["proposals"][number];

interface Props {
  onApplied?: () => void;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ScheduleOptimizerDialog({ onApplied }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [totalScheduled, setTotalScheduled] = useState(0);
  const [applying, setApplying] = useState(false);

  async function analyze() {
    setLoading(true);
    setProposals(null);
    try {
      const res = await fetch("/api/posts/optimize-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: true }),
      });
      if (!res.ok) throw new Error("Failed to analyze");
      const data = (await res.json()) as OptimizeScheduleResponse;
      setProposals(data.proposals);
      setTotalScheduled(data.totalScheduled);
    } catch {
      toast.error("Failed to analyze schedule");
      setProposals([]);
    } finally {
      setLoading(false);
    }
  }

  async function applyChanges() {
    setApplying(true);
    try {
      const res = await fetch("/api/posts/optimize-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: false }),
      });
      if (!res.ok) throw new Error("Failed to apply");
      const data = (await res.json()) as OptimizeScheduleResponse;
      toast.success(
        `${data.optimized} post${data.optimized === 1 ? "" : "s"} rescheduled to optimal times`
      );
      setOpen(false);
      onApplied?.();
    } catch {
      toast.error("Failed to apply optimizations");
    } finally {
      setApplying(false);
    }
  }

  function handleOpenChange(val: boolean) {
    setOpen(val);
    if (val) {
      void analyze();
    } else {
      setProposals(null);
      setTotalScheduled(0);
    }
  }

  const hasProposals = proposals !== null && proposals.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <TrendingUp className="mr-2 h-4 w-4" />
          Optimize Schedule
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            Schedule Optimizer
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-[8rem]">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              Analysing your posting history…
            </div>
          ) : proposals === null ? null : proposals.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
              <TrendingUp className="h-8 w-8 opacity-30" />
              {totalScheduled === 0
                ? "No upcoming scheduled posts to optimise."
                : "Your schedule is already at optimal times, or there isn't enough historical data yet."}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {proposals.length} of {totalScheduled} scheduled post
                {totalScheduled === 1 ? "" : "s"} can be moved to higher-engagement time slots.
              </p>
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {proposals.map((p) => (
                  <div
                    key={p.postId}
                    className="flex items-start justify-between gap-4 rounded-lg border p-3"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-xs text-muted-foreground">{p.reason}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-muted px-1.5 py-0.5 text-xs line-through">
                          {formatDateTime(p.currentScheduledAt)}
                        </span>
                        <span className="text-xs text-muted-foreground">→</span>
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                          {formatDateTime(p.proposedScheduledAt)}
                        </span>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900 dark:text-green-300">
                      {p.improvementFactor}×
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          {hasProposals && (
            <Button onClick={() => void applyChanges()} disabled={applying}>
              {applying
                ? "Applying…"
                : `Apply ${proposals.length} change${proposals.length === 1 ? "" : "s"}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
