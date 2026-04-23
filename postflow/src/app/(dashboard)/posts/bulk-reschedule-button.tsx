"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

interface BulkRescheduleButtonProps {
  selectedIds: string[];
  onDone: () => void;
}

export function BulkRescheduleButton({ selectedIds, onDone }: BulkRescheduleButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState("0");
  const [minutes, setMinutes] = useState("30");
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const h = parseInt(hours, 10) || 0;
    const m = parseInt(minutes, 10) || 0;
    const shiftMinutes = (h * 60 + m) * (direction === "backward" ? -1 : 1);

    if (shiftMinutes === 0) {
      toast({ title: "No shift specified", description: "Enter hours or minutes to shift.", variant: "destructive" });
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/posts/bulk-reschedule", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: selectedIds, shiftMinutes }),
        });

        const data = (await res.json()) as { rescheduled?: number; error?: string };

        if (!res.ok) {
          toast({ title: "Reschedule failed", description: data.error ?? "Unknown error", variant: "destructive" });
          return;
        }

        toast({
          title: `${data.rescheduled} post${data.rescheduled !== 1 ? "s" : ""} rescheduled`,
          description: `Shifted ${direction === "backward" ? "back" : "forward"} by ${h}h ${m}m.`,
        });
        setOpen(false);
        onDone();
        router.refresh();
      } catch {
        toast({ title: "Network error", description: "Could not reach the server.", variant: "destructive" });
      }
    });
  }

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={selectedIds.length === 0}
      >
        <Clock className="mr-2 h-4 w-4" />
        Reschedule ({selectedIds.length})
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
      <select
        value={direction}
        onChange={(e) => setDirection(e.target.value as "forward" | "backward")}
        className="h-8 rounded-md border border-input bg-background px-2 text-sm"
      >
        <option value="forward">Forward</option>
        <option value="backward">Backward</option>
      </select>
      <input
        type="number"
        min="0"
        max="8784"
        value={hours}
        onChange={(e) => setHours(e.target.value)}
        className="h-8 w-16 rounded-md border border-input bg-background px-2 text-sm"
        aria-label="Hours"
      />
      <span className="text-sm text-muted-foreground">h</span>
      <input
        type="number"
        min="0"
        max="59"
        value={minutes}
        onChange={(e) => setMinutes(e.target.value)}
        className="h-8 w-16 rounded-md border border-input bg-background px-2 text-sm"
        aria-label="Minutes"
      />
      <span className="text-sm text-muted-foreground">m</span>
      <Button type="submit" size="sm" disabled={isPending}>
        Apply
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </form>
  );
}
