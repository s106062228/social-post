"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Trash2 } from "lucide-react";

export function DeleteFeedButton({ feedId }: { feedId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this RSS feed and all its imported items?")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/rss-feeds/${feedId}`, { method: "DELETE" });
      if (!res.ok) {
        toast({ title: "Error", description: "Failed to delete feed", variant: "destructive" });
        return;
      }
      toast({ title: "Feed deleted" });
      router.refresh();
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleDelete}
      disabled={loading}
      title="Delete feed"
      className="h-8 w-8 text-destructive hover:text-destructive"
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}
