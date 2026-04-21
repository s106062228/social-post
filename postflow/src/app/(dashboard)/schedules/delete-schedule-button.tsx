"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Trash2, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface DeleteScheduleButtonProps {
  scheduleId: string;
}

export function DeleteScheduleButton({ scheduleId }: DeleteScheduleButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this recurring schedule? This cannot be undone.")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/schedules/${scheduleId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Deletion failed");
      }
      toast({ title: "Schedule deleted", variant: "success" });
      router.refresh();
    } catch (err) {
      toast({
        title: "Failed to delete schedule",
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
      onClick={handleDelete}
      disabled={loading}
      title="Delete schedule"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Trash2 className="h-4 w-4" />
      )}
    </Button>
  );
}
