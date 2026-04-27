"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { RefreshCw } from "lucide-react";

interface FetchResult {
  newItems: number;
  postsCreated: number;
  totalItems: number;
}

export function FetchFeedButton({ feedId }: { feedId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleFetch() {
    setLoading(true);
    try {
      const res = await fetch(`/api/rss-feeds/${feedId}/fetch`, { method: "POST" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        toast({
          title: "Fetch failed",
          description: data.error ?? "Could not fetch the feed",
          variant: "destructive",
        });
        return;
      }
      const data = (await res.json()) as FetchResult;
      toast({
        title: "Feed fetched",
        description:
          data.newItems === 0
            ? "No new items found."
            : `${data.newItems} new item${data.newItems !== 1 ? "s" : ""} imported${data.postsCreated > 0 ? `, ${data.postsCreated} draft post${data.postsCreated !== 1 ? "s" : ""} created` : ""}.`,
      });
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
      onClick={handleFetch}
      disabled={loading}
      title="Fetch now"
      className="h-8 w-8"
    >
      <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
    </Button>
  );
}
