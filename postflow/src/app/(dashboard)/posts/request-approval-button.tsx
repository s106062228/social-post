"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { ClipboardCheck } from "lucide-react";

interface RequestApprovalButtonProps {
  postId: string;
}

export function RequestApprovalButton({ postId }: RequestApprovalButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/posts/${postId}/request-approval`, {
          method: "POST",
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Failed to submit for approval");
        }
        toast({ title: "Post submitted for approval", variant: "success" });
        router.refresh();
      } catch (err) {
        toast({
          title: "Failed to submit for approval",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
      }
    });
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={isPending}
      className="gap-1"
      title="Submit for approval"
    >
      <ClipboardCheck className="h-4 w-4" />
      Review
    </Button>
  );
}
