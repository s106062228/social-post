"use client";

import { useState, useTransition } from "react";
import { Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

type TagOption = { id: string; name: string; color: string };

interface BulkTagButtonProps {
  selectedIds: string[];
  onDone: () => void;
}

export function BulkTagButton({ selectedIds, onDone }: BulkTagButtonProps) {
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState<TagOption[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<"add" | "remove">("add");
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function openDialog() {
    setLoading(true);
    try {
      const res = await fetch("/api/tags");
      if (res.ok) {
        const data = (await res.json()) as { tags: TagOption[] };
        setTags(data.tags);
      }
    } finally {
      setLoading(false);
    }
    setSelectedTagIds(new Set());
    setAction("add");
    setOpen(true);
  }

  function toggleTag(id: string) {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleApply() {
    if (selectedTagIds.size === 0) return;
    startTransition(async () => {
      try {
        const res = await fetch("/api/posts/bulk-tag", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            postIds: selectedIds,
            tagIds: Array.from(selectedTagIds),
            action,
          }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Bulk tag failed");
        }
        const data = (await res.json()) as { updated: number; skipped: number };
        toast({
          title: `${action === "add" ? "Added" : "Removed"} tags for ${data.updated} post${data.updated !== 1 ? "s" : ""}`,
          description: data.skipped > 0 ? `${data.skipped} publishing post(s) skipped` : undefined,
          variant: "success",
        });
        setOpen(false);
        onDone();
      } catch (err) {
        toast({
          title: "Bulk tag failed",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
      }
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={openDialog} disabled={selectedIds.length === 0}>
        <Tag className="mr-2 h-4 w-4" />
        Tag
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Bulk Tag {selectedIds.length} Post{selectedIds.length !== 1 ? "s" : ""}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex gap-2">
              <Button
                variant={action === "add" ? "default" : "outline"}
                size="sm"
                onClick={() => setAction("add")}
                className="flex-1"
              >
                Add tags
              </Button>
              <Button
                variant={action === "remove" ? "default" : "outline"}
                size="sm"
                onClick={() => setAction("remove")}
                className="flex-1"
              >
                Remove tags
              </Button>
            </div>

            {loading ? (
              <p className="text-sm text-muted-foreground">Loading tags…</p>
            ) : tags.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tags found. Create tags first.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => {
                  const isSelected = selectedTagIds.has(tag.id);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => toggleTag(tag.id)}
                      className={`rounded-full px-3 py-1 text-xs font-medium text-white transition-opacity ${
                        isSelected ? "opacity-100 outline outline-2 outline-offset-1" : "opacity-60"
                      }`}
                      style={{
                        backgroundColor: tag.color,
                        outlineColor: isSelected ? tag.color : undefined,
                      }}
                    >
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleApply}
              disabled={selectedTagIds.size === 0 || isPending}
            >
              {action === "add" ? "Add" : "Remove"} {selectedTagIds.size > 0 ? `(${selectedTagIds.size})` : ""}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
