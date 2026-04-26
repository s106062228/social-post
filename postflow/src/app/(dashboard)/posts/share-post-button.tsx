"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Share2, Unlink } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ShareLinkData {
  id: string;
  token: string;
  expiresAt: string | null;
  views: number;
}

interface SharePostButtonProps {
  postId: string;
}

export function SharePostButton({ postId }: SharePostButtonProps) {
  const [shareLink, setShareLink] = useState<ShareLinkData | null>(null);
  const [isPending, startTransition] = useTransition();

  function getShareUrl(token: string): string {
    return `${window.location.origin}/share/${token}`;
  }

  function handleShare() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/posts/${postId}/share`, { method: "POST" });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Failed to create share link");
        }
        const data = (await res.json()) as { shareLink: ShareLinkData };
        setShareLink(data.shareLink);
        const url = getShareUrl(data.shareLink.token);
        await navigator.clipboard.writeText(url);
        toast({ title: "Share link copied to clipboard!", variant: "success" });
      } catch (err) {
        toast({
          title: "Failed to create share link",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
      }
    });
  }

  function handleRevoke() {
    if (!confirm("Revoke this share link? Anyone with the link will lose access.")) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/posts/${postId}/share`, { method: "DELETE" });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Failed to revoke share link");
        }
        setShareLink(null);
        toast({ title: "Share link revoked", variant: "success" });
      } catch (err) {
        toast({
          title: "Failed to revoke share link",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
      }
    });
  }

  if (shareLink) {
    return (
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          title="Copy share link"
          onClick={async () => {
            const url = getShareUrl(shareLink.token);
            await navigator.clipboard.writeText(url);
            toast({ title: "Share link copied!", variant: "success" });
          }}
          disabled={isPending}
        >
          <Share2 className="h-4 w-4 text-green-600" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          title="Revoke share link"
          onClick={handleRevoke}
          disabled={isPending}
        >
          <Unlink className="h-4 w-4 text-red-500" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      title="Share post preview"
      onClick={handleShare}
      disabled={isPending}
    >
      <Share2 className="h-4 w-4" />
    </Button>
  );
}
