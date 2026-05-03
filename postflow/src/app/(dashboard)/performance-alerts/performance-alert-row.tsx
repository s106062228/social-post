"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertMetric, AlertOperator, Platform } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Pause, Play, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const METRIC_LABELS: Record<AlertMetric, string> = {
  IMPRESSIONS: "Impressions",
  REACH: "Reach",
  LIKES: "Likes",
  COMMENTS: "Comments",
  SHARES: "Shares",
  SCORE: "Score",
};

interface PerformanceAlert {
  id: string;
  name: string;
  metric: AlertMetric;
  operator: AlertOperator;
  threshold: number;
  platform: Platform | null;
  period: string;
  isActive: boolean;
  lastTriggeredAt: Date | null;
  createdAt: Date;
}

export function PerformanceAlertRow({ alert }: { alert: PerformanceAlert }) {
  const router = useRouter();
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const conditionText = `avg ${METRIC_LABELS[alert.metric]} ${
    alert.operator === AlertOperator.ABOVE ? ">" : "<"
  } ${alert.threshold} (last ${alert.period})`;

  async function handleToggle() {
    setToggling(true);
    try {
      const res = await fetch(`/api/performance-alerts/${alert.id}/toggle`, {
        method: "PATCH",
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to update alert");
      }
      const updated = (await res.json()) as { isActive: boolean };
      toast({
        title: updated.isActive ? "Alert activated" : "Alert paused",
        variant: "success",
      });
      router.refresh();
    } catch (err) {
      toast({
        title: "Failed to update alert",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setToggling(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete alert "${alert.name}"?`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/performance-alerts/${alert.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to delete alert");
      }
      toast({ title: "Alert deleted", variant: "success" });
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
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium truncate">{alert.name}</p>
          <Badge variant={alert.isActive ? "default" : "secondary"}>
            {alert.isActive ? "Active" : "Paused"}
          </Badge>
          {alert.platform && (
            <Badge variant="outline">{alert.platform}</Badge>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{conditionText}</p>
        {alert.lastTriggeredAt && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Last triggered: {new Date(alert.lastTriggeredAt).toLocaleDateString()}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleToggle}
          disabled={toggling || deleting}
          title={alert.isActive ? "Pause" : "Activate"}
        >
          {toggling ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : alert.isActive ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          <span className="sr-only">{alert.isActive ? "Pause" : "Activate"}</span>
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
