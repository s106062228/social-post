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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Bookmark } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface FilterValues {
  status?: string;
  platform?: string;
  tag?: string;
  search?: string;
  starred?: string;
  evergreen?: string;
  from?: string;
  to?: string;
}

interface SaveFilterButtonProps {
  filters: FilterValues;
  onSaved?: () => void;
}

export function SaveFilterButton({ filters, onSaved }: SaveFilterButtonProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();

  const hasActiveFilters = Object.values(filters).some(Boolean);

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;

    startTransition(async () => {
      try {
        const res = await fetch("/api/filter-presets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed, filters }),
        });

        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Failed to save preset");
        }

        toast({ title: "Filter preset saved", variant: "success" });
        setOpen(false);
        setName("");
        onSaved?.();
      } catch (err) {
        toast({
          title: "Failed to save preset",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={!hasActiveFilters}
          title={hasActiveFilters ? "Save current filters as a preset" : "Apply filters first"}
        >
          <Bookmark className="mr-1.5 h-3.5 w-3.5" />
          Save Filter
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Save filter preset</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 pt-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="preset-name">Name</Label>
            <Input
              id="preset-name"
              placeholder="e.g. Starred Facebook drafts"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!name.trim() || isPending}>
              {isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
