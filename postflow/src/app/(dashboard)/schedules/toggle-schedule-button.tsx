"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Play, Pause, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ToggleScheduleButtonProps {
  scheduleId: string;
  isActive: boolean;
}

export function ToggleScheduleButton({ scheduleId, isActive }: ToggleScheduleButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleToggle() {
    setLoading(true);
    try {
      const res = await fetch(`/api/schedules/${scheduleId}/toggle`, { method: "POST" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Toggle failed");
      }
      toast({
        title: isActive ? "Schedule paused" : "Schedule activated",
        variant: "success",
      });
      router.refresh();
    } catch (err) {
      toast({
        title: "Failed to update schedule",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleToggle}
      disabled={loading}
      title={isActive ? "Pause schedule" : "Activate schedule"}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : isActive ? (
        <Pause className="h-4 w-4" />
      ) : (
        <Play className="h-4 w-4" />
      )}
    </Button>
  );
}
