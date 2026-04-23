"use client";

import { useState } from "react";
import { Trash2, ToggleLeft, ToggleRight, Plus, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type WebhookEvent = "post.published" | "post.failed" | "post.partially_published";

interface WebhookConfig {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: Date | string;
}

interface Props {
  initialConfigs: WebhookConfig[];
}

const ALL_EVENTS: WebhookEvent[] = [
  "post.published",
  "post.failed",
  "post.partially_published",
];

const EVENT_LABELS: Record<WebhookEvent, string> = {
  "post.published": "Published",
  "post.failed": "Failed",
  "post.partially_published": "Partially published",
};

export function WebhooksClient({ initialConfigs }: Props) {
  const [configs, setConfigs] = useState<WebhookConfig[]>(initialConfigs);
  const [url, setUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<Set<WebhookEvent>>(
    new Set(ALL_EVENTS)
  );
  const [adding, setAdding] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function toggleEventSelection(event: WebhookEvent) {
    setSelectedEvents((prev: Set<WebhookEvent>) => {
      const next = new Set(prev);
      if (next.has(event)) {
        next.delete(event);
      } else {
        next.add(event);
      }
      return next;
    });
  }

  async function handleAdd() {
    if (!url.trim()) {
      toast({ title: "URL required", variant: "destructive" });
      return;
    }
    if (selectedEvents.size === 0) {
      toast({ title: "Select at least one event", variant: "destructive" });
      return;
    }

    setAdding(true);
    try {
      const res = await fetch("/api/webhook-configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), events: Array.from(selectedEvents) }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        toast({ title: data.error ?? "Failed to add webhook", variant: "destructive" });
        return;
      }

      const created = (await res.json()) as WebhookConfig & { secret?: string };

      // Show secret once — it won't be shown again
      if (created.secret) {
        await navigator.clipboard.writeText(created.secret).catch(() => null);
        toast({
          title: "Webhook created — secret copied to clipboard",
          description: `Secret: ${created.secret}`,
        });
      } else {
        toast({ title: "Webhook created" });
      }

      setConfigs((prev: WebhookConfig[]) => [created, ...prev]);
      setUrl("");
      setSelectedEvents(new Set(ALL_EVENTS));
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  }

  async function handleToggle(id: string) {
    const res = await fetch(`/api/webhook-configs/${id}/toggle`, {
      method: "PATCH",
    });
    if (!res.ok) {
      toast({ title: "Failed to update webhook", variant: "destructive" });
      return;
    }
    const updated = (await res.json()) as { isActive: boolean };
    setConfigs((prev: WebhookConfig[]) =>
      prev.map((c: WebhookConfig) => (c.id === id ? { ...c, isActive: updated.isActive } : c))
    );
    toast({
      title: updated.isActive ? "Webhook enabled" : "Webhook disabled",
    });
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this webhook? This cannot be undone.")) return;

    const res = await fetch(`/api/webhook-configs/${id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 204) {
      toast({ title: "Failed to delete webhook", variant: "destructive" });
      return;
    }
    setConfigs((prev: WebhookConfig[]) => prev.filter((c: WebhookConfig) => c.id !== id));
    toast({ title: "Webhook deleted" });
  }

  async function handleCopyUrl(id: string, webhookUrl: string) {
    await navigator.clipboard.writeText(webhookUrl).catch(() => null);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div className="space-y-6">
      {/* Add form */}
      <div className="rounded-lg border p-4 space-y-4">
        <p className="text-sm font-medium">Add new webhook</p>
        <div className="flex gap-2">
          <Input
            placeholder="https://your-server.com/webhook"
            value={url}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)}
            className="flex-1"
          />
          <Button onClick={handleAdd} disabled={adding} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            {adding ? "Adding…" : "Add"}
          </Button>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground font-medium">Listen for</p>
          <div className="flex flex-wrap gap-2">
            {ALL_EVENTS.map((event) => (
              <button
                key={event}
                type="button"
                onClick={() => toggleEventSelection(event)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  selectedEvents.has(event)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary"
                )}
              >
                {EVENT_LABELS[event]}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Each request is signed with{" "}
          <code className="font-mono bg-muted px-1 rounded">
            X-PostFlow-Signature: sha256=&lt;hmac&gt;
          </code>
          . The secret is shown once at creation time.
        </p>
      </div>

      {/* Config list */}
      {configs.length > 0 && (
        <div className="divide-y">
          {configs.map((config: WebhookConfig) => (
            <div
              key={config.id}
              className="flex items-start gap-4 py-4 first:pt-0 last:pb-0"
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-block h-2 w-2 rounded-full shrink-0",
                      config.isActive ? "bg-green-500" : "bg-muted-foreground"
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => handleCopyUrl(config.id, config.url)}
                    className="text-sm font-mono truncate hover:underline text-left"
                    title="Click to copy URL"
                  >
                    {config.url}
                  </button>
                  {copiedId === config.id ? (
                    <Check className="h-3 w-3 text-green-500 shrink-0" />
                  ) : (
                    <Copy className="h-3 w-3 text-muted-foreground shrink-0" />
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {config.events.map((ev: string) => (
                    <Badge key={ev} variant="secondary" className="text-xs">
                      {EVENT_LABELS[ev as WebhookEvent] ?? ev}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Added {new Date(config.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleToggle(config.id)}
                  title={config.isActive ? "Disable" : "Enable"}
                >
                  {config.isActive ? (
                    <ToggleRight className="h-4 w-4 text-green-500" />
                  ) : (
                    <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(config.id)}
                  title="Delete webhook"
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
