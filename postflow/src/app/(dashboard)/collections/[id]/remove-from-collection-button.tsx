"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

interface Props {
  collectionId: string;
  postId: string;
}

export function RemoveFromCollectionButton({ collectionId, postId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleRemove() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/collections/${collectionId}/posts/${postId}`,
        { method: "DELETE" }
      );
      if (!res.ok && res.status !== 204) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to remove post");
      }
      toast({ title: "Post removed from collection", variant: "success" });
      router.refresh();
    } catch (err) {
      toast({
        title: "Remove failed",
        description: err instanceof Error ? err.message : "An error occurred",
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
      onClick={handleRemove}
      disabled={loading}
      title="Remove from collection"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <X className="h-4 w-4" />
      )}
      <span className="sr-only">Remove post from collection</span>
    </Button>
  );
}
