"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { CheckCircle, XCircle } from "lucide-react";

interface ApprovalActionsProps {
  postId: string;
}

export function ApprovalActions({ postId }: ApprovalActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rejectNote, setRejectNote] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  function handleApprove() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/posts/${postId}/approve`, { method: "POST" });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Failed to approve");
        }
        toast({ title: "Post approved", variant: "success" });
        router.refresh();
      } catch (err) {
        toast({
          title: "Failed to approve",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
      }
    });
  }

  function handleRejectSubmit() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/posts/${postId}/reject`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: rejectNote || undefined }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Failed to reject");
        }
        toast({ title: "Post rejected" });
        setShowRejectInput(false);
        setRejectNote("");
        router.refresh();
      } catch (err) {
        toast({
          title: "Failed to reject",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
      }
    });
  }

  if (showRejectInput) {
    return (
      <div className="flex flex-col gap-2">
        <textarea
          className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Rejection note (optional)"
          rows={2}
          value={rejectNote}
          onChange={(e) => setRejectNote(e.target.value)}
          maxLength={500}
        />
        <div className="flex gap-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={handleRejectSubmit}
            disabled={isPending}
          >
            Confirm Reject
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowRejectInput(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        onClick={handleApprove}
        disabled={isPending}
        className="gap-1"
      >
        <CheckCircle className="h-4 w-4" />
        Approve
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowRejectInput(true)}
        disabled={isPending}
        className="gap-1 text-destructive hover:text-destructive"
      >
        <XCircle className="h-4 w-4" />
        Reject
      </Button>
    </div>
  );
}
