"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Star, Trash2, Loader2 } from "lucide-react";

interface UtmPreset {
  id: string;
  name: string;
  source: string;
  medium: string;
  campaign: string | null;
  content: string | null;
  term: string | null;
  isDefault: boolean;
  createdAt: Date;
}

export function UtmPresetRow({ preset }: { preset: UtmPreset }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function setDefault() {
    setBusy(true);
    try {
      const res = await fetch(`/api/utm-presets/${preset.id}/set-default`, { method: "PATCH" });
      if (!res.ok) {
        toast({ title: "Failed to set default.", variant: "destructive" });
        return;
      }
      toast({ title: `"${preset.name}" set as default.`, variant: "success" });
      router.refresh();
    } catch {
      toast({ title: "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function deletePreset() {
    if (!confirm(`Delete UTM preset "${preset.name}"?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/utm-presets/${preset.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast({ title: "Failed to delete preset.", variant: "destructive" });
        return;
      }
      toast({ title: "Preset deleted.", variant: "success" });
      router.refresh();
    } catch {
      toast({ title: "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const params = [
    `utm_source=${preset.source}`,
    `utm_medium=${preset.medium}`,
    preset.campaign && `utm_campaign=${preset.campaign}`,
    preset.content && `utm_content=${preset.content}`,
    preset.term && `utm_term=${preset.term}`,
  ]
    .filter(Boolean)
    .join("&");

  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{preset.name}</span>
          {preset.isDefault && (
            <Badge variant="secondary" className="shrink-0">
              Default
            </Badge>
          )}
        </div>
        <code className="text-xs text-muted-foreground break-all">{params}</code>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {!preset.isDefault && (
          <Button
            variant="ghost"
            size="icon"
            disabled={busy}
            onClick={setDefault}
            title="Set as default"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Star className="h-4 w-4" />
            )}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          disabled={busy}
          onClick={deletePreset}
          title="Delete preset"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4 text-destructive" />
          )}
        </Button>
      </div>
    </div>
  );
}
