"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

export function DeleteCampaignButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this campaign? Posts will not be deleted.")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to delete campaign");
      }
      toast({ title: "Campaign deleted", variant: "success" });
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
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Trash2 className="h-4 w-4" />
      )}
      <span className="sr-only">Delete campaign</span>
    </Button>
  );
}
