"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface DuplicatePostButtonProps {
  postId: string;
}

export function DuplicatePostButton({ postId }: DuplicatePostButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDuplicate() {
    setLoading(true);
    try {
      const res = await fetch(`/api/posts/${postId}/duplicate`, { method: "POST" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Duplication failed");
      }
      toast({ title: "Post duplicated", description: "A draft copy has been created.", variant: "success" });
      router.refresh();
    } catch (err) {
      toast({
        title: "Failed to duplicate",
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
      onClick={handleDuplicate}
      disabled={loading}
      title="Duplicate post"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </Button>
  );
}
