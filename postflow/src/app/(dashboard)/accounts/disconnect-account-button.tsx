"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2, Unlink } from "lucide-react";

interface Props {
  accountId: string;
  accountName: string;
}

export function DisconnectAccountButton({ accountId, accountName }: Props) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleDisconnect() {
    if (
      !confirm(
        `Disconnect "${accountName}"?\nYou can reconnect at any time via the OAuth flow.`
      )
    ) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json()) as { error: string };
        toast.error(body.error ?? "Failed to disconnect account");
        return;
      }
      toast.success(`${accountName} disconnected`);
      router.refresh();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleDisconnect}
      disabled={loading}
      className="text-destructive hover:text-destructive hover:bg-destructive/10"
      title={`Disconnect ${accountName}`}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Unlink className="h-4 w-4" />
      )}
      <span className="sr-only">Disconnect {accountName}</span>
    </Button>
  );
}
