"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export function RemovePostButton({
  collaborationId,
  postId,
}: {
  collaborationId: string;
  postId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleRemove() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/collaborations/${collaborationId}/posts/${postId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        toast({ title: "Error", description: "Failed to remove post", variant: "destructive" });
        return;
      }
      toast({ title: "Post removed from collaboration" });
      router.refresh();
    } catch {
      toast({ title: "Error", description: "Something went wrong", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleRemove}
      disabled={loading}
      className="h-7 w-7 text-muted-foreground hover:text-destructive"
      title="Remove from collaboration"
    >
      <X className="h-3.5 w-3.5" />
    </Button>
  );
}
