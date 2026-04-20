"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface RetryPostButtonProps {
  postId: string;
}

export function RetryPostButton({ postId }: RetryPostButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleRetry() {
    setLoading(true);
    try {
      const res = await fetch(`/api/posts/${postId}/retry`, { method: "POST" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Retry failed");
      }
      const data = (await res.json()) as {
        summary: { succeeded: number; failed: number; total: number };
      };
      if (data.summary.failed > 0 && data.summary.succeeded === 0) {
        toast({ title: "Retry failed", description: "All platforms failed again.", variant: "destructive" });
      } else if (data.summary.failed > 0) {
        toast({ title: "Partially retried", description: `${data.summary.succeeded}/${data.summary.total} platforms succeeded.`, variant: "default" });
      } else {
        toast({ title: "Post published", variant: "success" });
      }
      router.refresh();
    } catch (err) {
      toast({
        title: "Retry failed",
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
      onClick={handleRetry}
      disabled={loading}
      title="Retry failed publish"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <RotateCcw className="h-4 w-4" />
      )}
    </Button>
  );
}
