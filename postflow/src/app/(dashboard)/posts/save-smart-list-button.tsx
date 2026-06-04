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
import { ListFilter } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface SmartListFilters {
  statuses?: string[];
  platforms?: string[];
  sentiment?: string;
  tagIds?: string[];
  starred?: boolean;
  evergreen?: boolean;
  archived?: boolean;
  contentContains?: string;
  scheduledFrom?: string;
  scheduledTo?: string;
  contentCategory?: string;
  workflowStageId?: string;
  mediaType?: string;
}

interface SaveSmartListButtonProps {
  filters: SmartListFilters;
  onSaved?: () => void;
}

export function SaveSmartListButton({ filters, onSaved }: SaveSmartListButtonProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();

  const hasActiveFilters = Object.values(filters).some((v) =>
    Array.isArray(v) ? v.length > 0 : Boolean(v)
  );

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;

    startTransition(async () => {
      try {
        const res = await fetch("/api/smart-lists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed, filters }),
        });

        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Failed to save smart list");
        }

        toast({ title: "Smart list saved", variant: "success" });
        setOpen(false);
        setName("");
        onSaved?.();
      } catch (err) {
        toast({
          title: "Failed to save smart list",
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
          title={hasActiveFilters ? "Save current filters as a smart list" : "Apply filters first"}
        >
          <ListFilter className="mr-1.5 h-3.5 w-3.5" />
          Save as Smart List
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Save as Smart List</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 pt-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="smart-list-name">Name</Label>
            <Input
              id="smart-list-name"
              placeholder="e.g. Published Facebook Posts"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
              autoFocus
            />
          </div>
          <p className="text-xs text-muted-foreground">
            This will save your current filter combination so you can quickly access it later.
          </p>
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
