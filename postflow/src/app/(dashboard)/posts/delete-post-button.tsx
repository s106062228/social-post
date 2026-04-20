"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface DeletePostButtonProps {
  postId: string;
  status: string;
}

export function DeletePostButton({ postId, status }: DeletePostButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Cannot delete posts that are currently publishing
  if (status === "PUBLISHING") return null;

  async function handleDelete() {
    if (!confirm("Delete this post? This cannot be undone.")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/posts/${postId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to delete post");
      }
      toast({ title: "Post deleted", variant: "success" });
      router.refresh();
    } catch (err) {
      toast({
        title: "Failed to delete post",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleDelete}
      disabled={loading}
      className="text-destructive hover:text-destructive"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Trash2 className="h-4 w-4" />
      )}
    </Button>
  );
}
