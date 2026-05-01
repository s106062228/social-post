"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "@/hooks/use-toast";

interface StarPostButtonProps {
  postId: string;
  initialStarred: boolean;
}

export function StarPostButton({ postId, initialStarred }: StarPostButtonProps) {
  const router = useRouter();
  const [starred, setStarred] = useState(initialStarred);
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    const next = !starred;
    setStarred(next);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/posts/${postId}/star`, { method: "PATCH" });
        if (!res.ok) {
          setStarred(!next);
          toast({ title: "Failed to update star", variant: "destructive" });
          return;
        }
        const data = (await res.json()) as { starred: boolean };
        setStarred(data.starred);
        router.refresh();
      } catch {
        setStarred(!next);
        toast({ title: "Failed to update star", variant: "destructive" });
      }
    });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleToggle}
      disabled={isPending}
      title={starred ? "Unstar post" : "Star post"}
      aria-label={starred ? "Unstar post" : "Star post"}
    >
      <Star
        className={`h-4 w-4 ${starred ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`}
      />
    </Button>
  );
}
