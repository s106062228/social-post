"use client";

import { useState, useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { toast } from "@/hooks/use-toast";

const INTERVAL_OPTIONS = [
  { label: "Off", value: "off" },
  { label: "Every 7 days", value: "7" },
  { label: "Every 14 days", value: "14" },
  { label: "Every 30 days", value: "30" },
  { label: "Every 60 days", value: "60" },
  { label: "Every 90 days", value: "90" },
] as const;

interface RecycleConfigButtonProps {
  postId: string;
  initialInterval: number | null;
}

export function RecycleConfigButton({
  postId,
  initialInterval,
}: RecycleConfigButtonProps) {
  const router = useRouter();
  const [interval, setInterval] = useState<string>(
    initialInterval ? String(initialInterval) : "off"
  );
  const [isPending, startTransition] = useTransition();

  function handleChange(value: string) {
    const prev = interval;
    setInterval(value);

    startTransition(async () => {
      try {
        const recycleInterval = value === "off" ? null : parseInt(value, 10);
        const res = await fetch(`/api/posts/${postId}/recycle-config`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recycleInterval }),
        });

        if (!res.ok) {
          setInterval(prev);
          toast({ title: "Failed to update recycle config", variant: "destructive" });
          return;
        }

        const data = (await res.json()) as {
          recycleInterval: number | null;
          lastRecycledAt: string | null;
        };
        setInterval(data.recycleInterval ? String(data.recycleInterval) : "off");

        toast({
          title:
            data.recycleInterval
              ? `Auto-recycle set to every ${data.recycleInterval} days`
              : "Auto-recycle disabled",
          variant: "success",
        });
        router.refresh();
      } catch {
        setInterval(prev);
        toast({ title: "Failed to update recycle config", variant: "destructive" });
      }
    });
  }

  return (
    <Select value={interval} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger
        className="h-7 w-36 text-xs"
        title="Auto-recycle interval"
        aria-label="Auto-recycle interval"
      >
        <SelectValue placeholder="Auto-recycle" />
      </SelectTrigger>
      <SelectContent>
        {INTERVAL_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value} className="text-xs">
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
