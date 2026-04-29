"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ReportFrequency } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Pause, Play, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const FREQUENCY_LABELS: Record<ReportFrequency, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
};

interface ReportSchedule {
  id: string;
  frequency: ReportFrequency;
  recipientEmail: string;
  isActive: boolean;
  lastSentAt: Date | null;
  nextSendAt: Date;
  createdAt: Date;
}

export function ReportScheduleRow({ schedule }: { schedule: ReportSchedule }) {
  const router = useRouter();
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleToggle() {
    setToggling(true);
    try {
      const res = await fetch(`/api/report-schedules/${schedule.id}`, {
        method: "PATCH",
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to update schedule");
      }
      const updated = (await res.json()) as { isActive: boolean };
      toast({
        title: updated.isActive ? "Schedule activated" : "Schedule paused",
        variant: "success",
      });
      router.refresh();
    } catch (err) {
      toast({
        title: "Failed to update schedule",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setToggling(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this report schedule?")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/report-schedules/${schedule.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to delete schedule");
      }
      toast({ title: "Report schedule deleted", variant: "success" });
      router.refresh();
    } catch (err) {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">{schedule.recipientEmail}</p>
          <Badge variant={schedule.isActive ? "default" : "secondary"}>
            {schedule.isActive ? "Active" : "Paused"}
          </Badge>
          <Badge variant="outline">{FREQUENCY_LABELS[schedule.frequency]}</Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Next send: {new Date(schedule.nextSendAt).toLocaleDateString()}
          {schedule.lastSentAt && (
            <> · Last sent: {new Date(schedule.lastSentAt).toLocaleDateString()}</>
          )}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleToggle}
          disabled={toggling || deleting}
          title={schedule.isActive ? "Pause" : "Activate"}
        >
          {toggling ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : schedule.isActive ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          <span className="sr-only">{schedule.isActive ? "Pause" : "Activate"}</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          disabled={toggling || deleting}
        >
          {deleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
          <span className="sr-only">Delete</span>
        </Button>
      </div>
    </div>
  );
}
