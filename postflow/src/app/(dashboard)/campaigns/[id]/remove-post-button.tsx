"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

interface RemovePostButtonProps {
  campaignId: string;
  postId: string;
}

export function RemovePostButton({ campaignId, postId }: RemovePostButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleRemove() {
    setLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/posts/${postId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to remove post");
      }
      toast({ title: "Post removed from campaign", variant: "success" });
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
    <Button variant="ghost" size="sm" onClick={handleRemove} disabled={loading} title="Remove from campaign">
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <X className="h-4 w-4" />
      )}
      <span className="sr-only">Remove post from campaign</span>
    </Button>
  );
}
