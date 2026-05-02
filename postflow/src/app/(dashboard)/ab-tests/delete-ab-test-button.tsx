"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Loader2, Trash2 } from "lucide-react";

interface DeleteABTestButtonProps {
  testId: string;
}

export function DeleteABTestButton({ testId }: DeleteABTestButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this A/B test? The posts will not be affected.")) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/ab-tests/${testId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      toast({ title: "A/B test deleted", variant: "success" });
      router.refresh();
    } catch {
      toast({ title: "Failed to delete A/B test", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="ghost" size="icon" onClick={handleDelete} disabled={loading} title="Delete test">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </Button>
  );
}
