"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export function AddPostButton({ collaborationId }: { collaborationId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [postId, setPostId] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleAdd(e: { preventDefault: () => void }) {
    e.preventDefault();
    if (!postId.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/collaborations/${collaborationId}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: postId.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Error", description: data.error ?? "Failed to add post", variant: "destructive" });
        return;
      }
      toast({ title: "Post added to collaboration" });
      setPostId("");
      setOpen(false);
      router.refresh();
    } catch {
      toast({ title: "Error", description: "Something went wrong", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-2" />
        Add post
      </Button>
    );
  }

  return (
    <form onSubmit={handleAdd} className="flex items-end gap-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="post-id-input" className="text-xs">Post ID</Label>
        <Input
          id="post-id-input"
          value={postId}
          onChange={(e) => setPostId(e.target.value)}
          placeholder="paste post ID..."
          className="h-8 text-sm w-64"
          autoFocus
        />
      </div>
      <Button type="submit" size="sm" disabled={loading || !postId.trim()}>
        {loading ? "Adding..." : "Add"}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </form>
  );
}
