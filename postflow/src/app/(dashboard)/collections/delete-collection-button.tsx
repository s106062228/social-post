"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

export function DeleteCollectionButton({ collectionId }: { collectionId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this collection? Posts will not be deleted.")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/collections/${collectionId}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to delete collection");
      }
      toast({ title: "Collection deleted", variant: "success" });
      router.refresh();
    } catch (err) {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleDelete} disabled={loading}>
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Trash2 className="h-3.5 w-3.5" />
      )}
      <span className="sr-only">Delete collection</span>
    </Button>
  );
}
