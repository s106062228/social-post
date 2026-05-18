"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";

interface PublishingControlsProps {
  initialPaused: boolean;
  initialReason: string | null;
  initialPausedAt: Date | null;
}

export function PublishingControls({
  initialPaused,
  initialReason,
  initialPausedAt,
}: PublishingControlsProps) {
  const [paused, setPaused] = useState(initialPaused);
  const [reason, setReason] = useState(initialReason ?? "");
  const [pausedAt, setPausedAt] = useState<Date | null>(initialPausedAt);
  const [saving, setSaving] = useState(false);

  async function handleToggle(checked: boolean) {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/publishing-pause", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paused: checked,
          ...(checked && reason.trim() ? { reason: reason.trim() } : {}),
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        toast({
          title: "Error",
          description: data.error ?? "Failed to update publishing state",
          variant: "destructive",
        });
        return;
      }

      const data = (await res.json()) as {
        paused: boolean;
        reason: string | null;
        pausedAt: string | null;
      };
      setPaused(data.paused);
      setReason(data.reason ?? "");
      setPausedAt(data.pausedAt ? new Date(data.pausedAt) : null);
      toast({
        title: data.paused ? "Publishing paused" : "Publishing resumed",
        description: data.paused
          ? "All outgoing posts will be held and retried every 30 minutes."
          : "Posts will be published normally.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveReason() {
    if (!paused) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/publishing-pause", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: true, reason: reason.trim() || undefined }),
      });

      if (res.ok) {
        toast({ title: "Reason updated" });
      } else {
        const data = (await res.json()) as { error?: string };
        toast({
          title: "Error",
          description: data.error ?? "Failed to update reason",
          variant: "destructive",
        });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Publishing Controls</CardTitle>
        <CardDescription>
          Pause all outgoing publishing. While paused, queued jobs will be
          re-tried every 30 minutes for up to 48 hours.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Switch
            id="publishing-pause"
            checked={paused}
            onCheckedChange={(checked) => void handleToggle(checked)}
            disabled={saving}
          />
          <Label htmlFor="publishing-pause" className="cursor-pointer">
            {paused ? "Publishing is paused" : "Publishing is active"}
          </Label>
          {pausedAt && (
            <span className="ml-auto text-xs text-muted-foreground">
              Paused since{" "}
              {pausedAt.toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </span>
          )}
        </div>

        {paused && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="pause-reason">Reason (optional)</Label>
            <Textarea
              id="pause-reason"
              placeholder="e.g. Scheduled maintenance, reviewing content strategy…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={2}
              className="resize-none"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {reason.length}/500
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleSaveReason()}
                disabled={saving}
              >
                Save Reason
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
