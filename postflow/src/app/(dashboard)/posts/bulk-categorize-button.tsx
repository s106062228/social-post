"use client";

import { useState, useTransition } from "react";
import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

const CATEGORIES = [
  { value: null, label: "None (clear category)" },
  { value: "EDUCATIONAL", label: "Educational" },
  { value: "PROMOTIONAL", label: "Promotional" },
  { value: "ENTERTAINING", label: "Entertaining" },
  { value: "ENGAGING", label: "Engaging" },
  { value: "INSPIRING", label: "Inspiring" },
  { value: "NEWS", label: "News" },
  { value: "BEHIND_THE_SCENES", label: "Behind the Scenes" },
  { value: "USER_GENERATED", label: "User Generated" },
] as const;

interface BulkCategorizeButtonProps {
  selectedIds: string[];
  onDone: () => void;
}

export function BulkCategorizeButton({ selectedIds, onDone }: BulkCategorizeButtonProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleApply() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/posts/bulk-categorize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            postIds: selectedIds,
            contentCategory: selected,
          }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Bulk categorize failed");
        }
        const data = (await res.json()) as { updated: number };
        const categoryLabel =
          CATEGORIES.find((c) => c.value === selected)?.label ?? selected ?? "None";
        toast({
          title: `Set "${categoryLabel}" for ${data.updated} post${data.updated !== 1 ? "s" : ""}`,
          variant: "success",
        });
        setOpen(false);
        onDone();
      } catch (err) {
        toast({
          title: "Bulk categorize failed",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
      }
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setSelected(null);
          setOpen(true);
        }}
        disabled={selectedIds.length === 0}
      >
        <FolderOpen className="mr-2 h-4 w-4" />
        Categorize
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Categorize {selectedIds.length} Post{selectedIds.length !== 1 ? "s" : ""}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            {CATEGORIES.map((cat) => (
              <button
                key={String(cat.value)}
                onClick={() => setSelected(cat.value)}
                className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  selected === cat.value
                    ? "border-primary bg-primary/10 font-medium"
                    : "border-transparent hover:bg-accent"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleApply} disabled={selected === undefined || isPending}>
              Apply
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
