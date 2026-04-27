"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface ToggleCampaignButtonProps {
  campaignId: string;
  isActive: boolean;
}

export function ToggleCampaignButton({ campaignId, isActive }: ToggleCampaignButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleToggle() {
    setLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to update campaign");
      }
      toast({
        title: isActive ? "Campaign paused" : "Campaign activated",
        variant: "success",
      });
      router.refresh();
    } catch (err) {
      toast({
        title: "Update failed",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleToggle} disabled={loading}>
      {loading && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
      {isActive ? "Pause" : "Activate"}
    </Button>
  );
}
