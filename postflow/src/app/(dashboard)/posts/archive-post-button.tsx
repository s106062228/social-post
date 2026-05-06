"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Archive, ArchiveRestore } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "@/hooks/use-toast";

interface ArchivePostButtonProps {
  postId: string;
  initialArchivedAt: string | null;
}

export function ArchivePostButton({ postId, initialArchivedAt }: ArchivePostButtonProps) {
  const router = useRouter();
  const [archivedAt, setArchivedAt] = useState<string | null>(initialArchivedAt);
  const [isPending, startTransition] = useTransition();

  const isArchived = !!archivedAt;

  function handleToggle() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/posts/${postId}/archive`, { method: "PATCH" });
        if (!res.ok) {
          toast({ title: isArchived ? "Failed to restore post" : "Failed to archive post", variant: "destructive" });
          return;
        }
        const data = (await res.json()) as { archivedAt: string | null };
        setArchivedAt(data.archivedAt);
        toast({
          title: data.archivedAt ? "Post archived" : "Post restored",
          description: data.archivedAt
            ? "The post has been moved to the archive."
            : "The post has been restored.",
        });
        router.refresh();
      } catch {
        toast({ title: isArchived ? "Failed to restore post" : "Failed to archive post", variant: "destructive" });
      }
    });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleToggle}
      disabled={isPending}
      title={isArchived ? "Restore from archive" : "Archive post"}
      aria-label={isArchived ? "Restore from archive" : "Archive post"}
    >
      {isArchived ? (
        <ArchiveRestore className="h-4 w-4 text-muted-foreground" />
      ) : (
        <Archive className="h-4 w-4 text-muted-foreground" />
      )}
    </Button>
  );
}
