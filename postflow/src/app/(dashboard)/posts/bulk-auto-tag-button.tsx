"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "@/hooks/use-toast";

interface BulkAutoTagButtonProps {
  selectedIds: string[];
  onDone?: () => void;
}

export function BulkAutoTagButton({ selectedIds, onDone }: BulkAutoTagButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (selectedIds.length === 0) return null;

  function handleAutoTag() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/posts/bulk-auto-tag", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postIds: selectedIds, applyTopN: 3 }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          toast({
            title: "Auto-tag failed",
            description: data.error ?? "Please try again.",
            variant: "destructive",
          });
          return;
        }
        const data = (await res.json()) as {
          tagged: number;
          created: number;
          skipped: number;
        };
        toast({
          title: "Auto-tagging complete",
          description: `Tagged ${data.tagged} post${data.tagged !== 1 ? "s" : ""}${data.created > 0 ? `, created ${data.created} new tag${data.created !== 1 ? "s" : ""}` : ""}${data.skipped > 0 ? `, skipped ${data.skipped}` : ""}.`,
        });
        onDone?.();
        router.refresh();
      } catch {
        toast({ title: "Auto-tag failed", variant: "destructive" });
      }
    });
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleAutoTag}
      disabled={isPending}
    >
      {isPending ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Sparkles className="mr-2 h-4 w-4" />
      )}
      Auto-tag {selectedIds.length}
    </Button>
  );
}
