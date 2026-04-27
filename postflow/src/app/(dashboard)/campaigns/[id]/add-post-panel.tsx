"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Loader2, Plus } from "lucide-react";

interface Post {
  id: string;
  content: string;
  status: string;
}

interface AddPostPanelProps {
  campaignId: string;
  availablePosts: Post[];
}

export function AddPostPanel({ campaignId, availablePosts }: AddPostPanelProps) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleAdd() {
    if (!selectedId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: selectedId }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to add post");
      }
      toast({ title: "Post added to campaign", variant: "success" });
      setSelectedId("");
      router.refresh();
    } catch (err) {
      toast({
        title: "Add failed",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  if (availablePosts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        All your posts are already in this campaign, or you have no posts yet.
      </p>
    );
  }

  return (
    <div className="flex gap-2">
      <select
        className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
      >
        <option value="">Select a post to add…</option>
        {availablePosts.map((post) => (
          <option key={post.id} value={post.id}>
            [{post.status}] {post.content.slice(0, 80)}{post.content.length > 80 ? "…" : ""}
          </option>
        ))}
      </select>
      <Button onClick={handleAdd} disabled={!selectedId || loading} size="sm">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Plus className="h-4 w-4" />
        )}
        Add
      </Button>
    </div>
  );
}
