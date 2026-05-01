"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Leaf } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "@/hooks/use-toast";

interface EvergreenButtonProps {
  postId: string;
  initialEvergreen: boolean;
}

export function EvergreenButton({ postId, initialEvergreen }: EvergreenButtonProps) {
  const router = useRouter();
  const [isEvergreen, setIsEvergreen] = useState(initialEvergreen);
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    const next = !isEvergreen;
    setIsEvergreen(next);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/posts/${postId}/evergreen`, { method: "PATCH" });
        if (!res.ok) {
          setIsEvergreen(!next);
          toast({ title: "Failed to update evergreen status", variant: "destructive" });
          return;
        }
        const data = (await res.json()) as { isEvergreen: boolean };
        setIsEvergreen(data.isEvergreen);
        toast({
          title: data.isEvergreen ? "Marked as evergreen" : "Removed evergreen mark",
          variant: "success",
        });
        router.refresh();
      } catch {
        setIsEvergreen(!next);
        toast({ title: "Failed to update evergreen status", variant: "destructive" });
      }
    });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleToggle}
      disabled={isPending}
      title={isEvergreen ? "Remove evergreen mark" : "Mark as evergreen"}
      aria-label={isEvergreen ? "Remove evergreen mark" : "Mark as evergreen"}
    >
      <Leaf
        className={`h-4 w-4 ${isEvergreen ? "fill-emerald-500 text-emerald-500" : "text-muted-foreground"}`}
      />
    </Button>
  );
}
