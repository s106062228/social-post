"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CalendarClock, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ScheduledResult {
  postId: string;
  scheduledAt: string;
  reason: string;
}

interface FailedResult {
  postId: string;
  reason: string;
}

interface BatchScheduleDialogProps {
  postIds: string[];
  onDone?: () => void;
}

function formatDatetime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function BatchScheduleDialog({ postIds, onDone }: BatchScheduleDialogProps) {
  const [open, setOpen] = useState(false);
  const [scheduled, setScheduled] = useState<ScheduledResult[]>([]);
  const [failed, setFailed] = useState<FailedResult[]>([]);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  const draftCount = postIds.length;

  function handleOpen(isOpen: boolean) {
    setOpen(isOpen);
    if (!isOpen) {
      // Reset state when closing
      setScheduled([]);
      setFailed([]);
      setDone(false);
    }
  }

  function handleSchedule() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/ai/batch-schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postIds }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({})) as { error?: string };
          toast({
            title: "Scheduling failed",
            description: data.error ?? "Unexpected error",
            variant: "destructive",
          });
          return;
        }

        const data = await res.json() as { scheduled: ScheduledResult[]; failed: FailedResult[] };
        setScheduled(data.scheduled ?? []);
        setFailed(data.failed ?? []);
        setDone(true);

        if ((data.scheduled ?? []).length > 0) {
          toast({ title: `Scheduled ${data.scheduled.length} post${data.scheduled.length !== 1 ? "s" : ""}` });
        }
      } catch {
        toast({ title: "Network error", variant: "destructive" });
      }
    });
  }

  function handleClose() {
    setOpen(false);
    setScheduled([]);
    setFailed([]);
    setDone(false);
    onDone?.();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={draftCount === 0}>
          <CalendarClock className="mr-2 h-4 w-4" />
          AI Schedule ({draftCount})
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>AI Batch Scheduling</DialogTitle>
        </DialogHeader>

        {!done ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              PostFlow will analyse your historical engagement data and schedule{" "}
              <strong>{draftCount} draft post{draftCount !== 1 ? "s" : ""}</strong> at optimal
              times automatically.
            </p>
            <p className="text-sm text-muted-foreground">
              Each post receives a unique slot — no two posts share the same time window.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => handleOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSchedule} disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Scheduling…
                  </>
                ) : (
                  "Schedule All"
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm font-medium">
              {scheduled.length} scheduled &bull; {failed.length} failed
            </p>

            <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
              {scheduled.map((r) => (
                <div
                  key={r.postId}
                  className="flex items-start gap-2 rounded-md border bg-green-50 px-3 py-2 text-sm dark:bg-green-950"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                  <div className="min-w-0">
                    <p className="font-medium text-green-800 dark:text-green-200">
                      {formatDatetime(r.scheduledAt)}
                    </p>
                    <p className="truncate text-xs text-green-600 dark:text-green-400">{r.reason}</p>
                  </div>
                </div>
              ))}

              {failed.map((r) => (
                <div
                  key={r.postId}
                  className="flex items-start gap-2 rounded-md border bg-red-50 px-3 py-2 text-sm dark:bg-red-950"
                >
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <p className="text-red-700 dark:text-red-300">{r.reason}</p>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <Button size="sm" onClick={handleClose}>
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
