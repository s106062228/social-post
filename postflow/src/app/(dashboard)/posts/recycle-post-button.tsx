"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "@/hooks/use-toast";

interface RecyclePostButtonProps {
  postId: string;
}

export function RecyclePostButton({ postId }: RecyclePostButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleRecycle() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/posts/${postId}/recycle`, { method: "POST" });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          toast({
            title: "Failed to recycle post",
            description: data.error,
            variant: "destructive",
          });
          return;
        }
        toast({ title: "Post recycled as new draft", variant: "success" });
        router.refresh();
      } catch {
        toast({ title: "Failed to recycle post", variant: "destructive" });
      }
    });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleRecycle}
      disabled={isPending}
      title="Recycle post as new draft"
      aria-label="Recycle post as new draft"
    >
      <RefreshCw className="h-4 w-4 text-muted-foreground" />
    </Button>
  );
}
