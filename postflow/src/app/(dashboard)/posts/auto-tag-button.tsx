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
import { Tag, Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "@/hooks/use-toast";

interface TagSuggestion {
  tagId?: string;
  name: string;
  reason: string;
  isNew: boolean;
}

interface AutoTagButtonProps {
  postId: string;
}

export function AutoTagButton({ postId }: AutoTagButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isApplying, startApplyTransition] = useTransition();

  function handleOpen(isOpen: boolean) {
    setOpen(isOpen);
    if (isOpen && !loaded) {
      loadSuggestions();
    }
    if (!isOpen) {
      setSuggestions([]);
      setSelected(new Set());
      setLoaded(false);
    }
  }

  function loadSuggestions() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/posts/${postId}/suggest-tags`, {
          method: "POST",
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          toast({
            title: "Could not load suggestions",
            description: data.error ?? "Please try again.",
            variant: "destructive",
          });
          setOpen(false);
          return;
        }
        const data = (await res.json()) as { suggestions: TagSuggestion[] };
        setSuggestions(data.suggestions);
        setSelected(new Set(data.suggestions.map((_, i) => i)));
        setLoaded(true);
      } catch {
        toast({
          title: "Could not load suggestions",
          variant: "destructive",
        });
        setOpen(false);
      }
    });
  }

  function toggleSelection(index: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  function applyTags() {
    const toApply = suggestions.filter((_, i) => selected.has(i));
    if (toApply.length === 0) {
      toast({ title: "No tags selected" });
      return;
    }

    startApplyTransition(async () => {
      try {
        // For each selected tag: if it has a tagId use it, otherwise create via bulk-auto-tag
        // We call bulk-auto-tag with just this post, it handles creating new tags
        const res = await fetch(`/api/posts/bulk-auto-tag`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postIds: [postId], applyTopN: toApply.length }),
        });
        if (!res.ok) {
          toast({ title: "Failed to apply tags", variant: "destructive" });
          return;
        }
        const data = (await res.json()) as {
          tagged: number;
          created: number;
          skipped: number;
        };
        toast({
          title: "Tags applied",
          description: `Applied tags to post${data.created > 0 ? ` (${data.created} new tag${data.created > 1 ? "s" : ""} created)` : ""}.`,
        });
        setOpen(false);
        router.refresh();
      } catch {
        toast({ title: "Failed to apply tags", variant: "destructive" });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          title="AI tag suggestions"
          aria-label="AI tag suggestions"
        >
          <Sparkles className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            AI Tag Suggestions
          </DialogTitle>
        </DialogHeader>

        {isPending ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">
              Analyzing content…
            </span>
          </div>
        ) : loaded && suggestions.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No tag suggestions found for this post.
          </p>
        ) : loaded ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select tags to apply to this post:
            </p>
            <div className="space-y-2">
              {suggestions.map((s, i) => (
                <label
                  key={i}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-accent"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded"
                    checked={selected.has(i)}
                    onChange={() => toggleSelection(i)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{s.name}</span>
                      {s.isNew && (
                        <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                          New
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {s.reason}
                    </p>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={applyTags}
                disabled={isApplying || selected.size === 0}
              >
                {isApplying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Applying…
                  </>
                ) : (
                  `Apply ${selected.size} Tag${selected.size !== 1 ? "s" : ""}`
                )}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
