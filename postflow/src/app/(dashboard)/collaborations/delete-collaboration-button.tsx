"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export function DeleteCollaborationButton({ collaborationId }: { collaborationId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this collaboration? This cannot be undone.")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/collaborations/${collaborationId}`, { method: "DELETE" });
      if (!res.ok) {
        toast({ title: "Error", description: "Failed to delete collaboration", variant: "destructive" });
        return;
      }
      toast({ title: "Collaboration deleted" });
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
      onClick={handleDelete}
      disabled={loading}
      className="h-8 w-8 text-muted-foreground hover:text-destructive"
      title="Delete collaboration"
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}
