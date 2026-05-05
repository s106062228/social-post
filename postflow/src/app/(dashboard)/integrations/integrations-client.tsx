"use client";

import { useState } from "react";
import {
  Trash2,
  ToggleLeft,
  ToggleRight,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type IntegrationEvent =
  | "post.published"
  | "post.failed"
  | "post.partially_published";

const ALL_EVENTS: IntegrationEvent[] = [
  "post.published",
  "post.failed",
  "post.partially_published",
];

const EVENT_LABELS: Record<IntegrationEvent, string> = {
  "post.published": "Published",
  "post.failed": "Failed",
  "post.partially_published": "Partially published",
};

interface SlackItem {
  id: string;
  workspaceName: string;
  webhookUrl: string;
  events: string[];
  isActive: boolean;
  createdAt: Date | string;
}

interface DiscordItem {
  id: string;
  channelName: string;
  webhookUrl: string;
  events: string[];
  isActive: boolean;
  createdAt: Date | string;
}

interface Props {
  initialSlack: SlackItem[];
  initialDiscord: DiscordItem[];
}

type Tab = "slack" | "discord";

function EventPills({
  selected,
  onToggle,
}: {
  selected: Set<IntegrationEvent>;
  onToggle: (e: IntegrationEvent) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {ALL_EVENTS.map((event) => (
        <button
          key={event}
          type="button"
          onClick={() => onToggle(event)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            selected.has(event)
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-muted-foreground border-border hover:border-primary"
          )}
        >
          {EVENT_LABELS[event]}
        </button>
      ))}
    </div>
  );
}

function IntegrationRow({
  name,
  webhookUrl,
  events,
  isActive,
  createdAt,
  onToggle,
  onDelete,
}: {
  name: string;
  webhookUrl: string;
  events: string[];
  isActive: boolean;
  createdAt: Date | string;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-start gap-4 py-4 border-b last:border-0">
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-block h-2 w-2 rounded-full shrink-0",
              isActive ? "bg-green-500" : "bg-muted-foreground"
            )}
          />
          <span className="text-sm font-medium">{name}</span>
        </div>
        <p className="text-xs font-mono text-muted-foreground truncate">
          {webhookUrl}
        </p>
        <div className="flex flex-wrap gap-1">
          {events.map((ev) => (
            <Badge key={ev} variant="secondary" className="text-xs">
              {EVENT_LABELS[ev as IntegrationEvent] ?? ev}
            </Badge>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Added {new Date(createdAt).toLocaleDateString()}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          title={isActive ? "Disable" : "Enable"}
        >
          {isActive ? (
            <ToggleRight className="h-4 w-4 text-green-500" />
          ) : (
            <ToggleLeft className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          title="Delete integration"
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function IntegrationsClient({ initialSlack, initialDiscord }: Props) {
  const [tab, setTab] = useState<Tab>("slack");

  // Slack state
  const [slackItems, setSlackItems] = useState<SlackItem[]>(initialSlack);
  const [slackName, setSlackName] = useState("");
  const [slackUrl, setSlackUrl] = useState("");
  const [slackEvents, setSlackEvents] = useState<Set<IntegrationEvent>>(
    new Set(ALL_EVENTS)
  );
  const [addingSlack, setAddingSlack] = useState(false);

  // Discord state
  const [discordItems, setDiscordItems] = useState<DiscordItem[]>(initialDiscord);
  const [discordName, setDiscordName] = useState("");
  const [discordUrl, setDiscordUrl] = useState("");
  const [discordEvents, setDiscordEvents] = useState<Set<IntegrationEvent>>(
    new Set(ALL_EVENTS)
  );
  const [addingDiscord, setAddingDiscord] = useState(false);

  // ── Slack handlers ────────────────────────────────────────────────────────

  async function handleAddSlack() {
    if (!slackName.trim()) {
      toast({ title: "Workspace name required", variant: "destructive" });
      return;
    }
    if (!slackUrl.trim()) {
      toast({ title: "Webhook URL required", variant: "destructive" });
      return;
    }
    if (slackEvents.size === 0) {
      toast({ title: "Select at least one event", variant: "destructive" });
      return;
    }

    setAddingSlack(true);
    try {
      const res = await fetch("/api/integrations/slack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceName: slackName.trim(),
          webhookUrl: slackUrl.trim(),
          events: Array.from(slackEvents),
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        toast({
          title: data.error ?? "Failed to add Slack integration",
          variant: "destructive",
        });
        return;
      }

      const created = (await res.json()) as SlackItem;
      setSlackItems((prev) => [created, ...prev]);
      setSlackName("");
      setSlackUrl("");
      setSlackEvents(new Set(ALL_EVENTS));
      toast({ title: "Slack integration added" });
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setAddingSlack(false);
    }
  }

  async function handleToggleSlack(id: string) {
    const res = await fetch(`/api/integrations/slack/${id}`, {
      method: "PATCH",
    });
    if (!res.ok) {
      toast({ title: "Failed to update integration", variant: "destructive" });
      return;
    }
    const updated = (await res.json()) as { isActive: boolean };
    setSlackItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, isActive: updated.isActive } : i))
    );
    toast({
      title: updated.isActive ? "Integration enabled" : "Integration disabled",
    });
  }

  async function handleDeleteSlack(id: string) {
    if (!confirm("Delete this Slack integration?")) return;
    const res = await fetch(`/api/integrations/slack/${id}`, {
      method: "DELETE",
    });
    if (!res.ok && res.status !== 204) {
      toast({ title: "Failed to delete integration", variant: "destructive" });
      return;
    }
    setSlackItems((prev) => prev.filter((i) => i.id !== id));
    toast({ title: "Slack integration deleted" });
  }

  // ── Discord handlers ──────────────────────────────────────────────────────

  async function handleAddDiscord() {
    if (!discordName.trim()) {
      toast({ title: "Channel name required", variant: "destructive" });
      return;
    }
    if (!discordUrl.trim()) {
      toast({ title: "Webhook URL required", variant: "destructive" });
      return;
    }
    if (discordEvents.size === 0) {
      toast({ title: "Select at least one event", variant: "destructive" });
      return;
    }

    setAddingDiscord(true);
    try {
      const res = await fetch("/api/integrations/discord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelName: discordName.trim(),
          webhookUrl: discordUrl.trim(),
          events: Array.from(discordEvents),
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        toast({
          title: data.error ?? "Failed to add Discord integration",
          variant: "destructive",
        });
        return;
      }

      const created = (await res.json()) as DiscordItem;
      setDiscordItems((prev) => [created, ...prev]);
      setDiscordName("");
      setDiscordUrl("");
      setDiscordEvents(new Set(ALL_EVENTS));
      toast({ title: "Discord integration added" });
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setAddingDiscord(false);
    }
  }

  async function handleToggleDiscord(id: string) {
    const res = await fetch(`/api/integrations/discord/${id}`, {
      method: "PATCH",
    });
    if (!res.ok) {
      toast({ title: "Failed to update integration", variant: "destructive" });
      return;
    }
    const updated = (await res.json()) as { isActive: boolean };
    setDiscordItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, isActive: updated.isActive } : i))
    );
    toast({
      title: updated.isActive ? "Integration enabled" : "Integration disabled",
    });
  }

  async function handleDeleteDiscord(id: string) {
    if (!confirm("Delete this Discord integration?")) return;
    const res = await fetch(`/api/integrations/discord/${id}`, {
      method: "DELETE",
    });
    if (!res.ok && res.status !== 204) {
      toast({ title: "Failed to delete integration", variant: "destructive" });
      return;
    }
    setDiscordItems((prev) => prev.filter((i) => i.id !== id));
    toast({ title: "Discord integration deleted" });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(["slack", "discord"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px",
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t === "slack" ? "Slack" : "Discord"}
          </button>
        ))}
      </div>

      {/* Slack panel */}
      {tab === "slack" && (
        <div className="space-y-6">
          <div className="rounded-lg border p-4 space-y-4">
            <p className="text-sm font-medium">Add Slack integration</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                placeholder="Workspace name (e.g. My Team)"
                value={slackName}
                onChange={(e) => setSlackName(e.target.value)}
              />
              <Input
                placeholder="https://hooks.slack.com/services/…"
                value={slackUrl}
                onChange={(e) => setSlackUrl(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">
                Listen for
              </p>
              <EventPills
                selected={slackEvents}
                onToggle={(e) =>
                  setSlackEvents((prev) => {
                    const next = new Set(prev);
                    next.has(e) ? next.delete(e) : next.add(e);
                    return next;
                  })
                }
              />
            </div>
            <Button onClick={handleAddSlack} disabled={addingSlack} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              {addingSlack ? "Adding…" : "Add Slack integration"}
            </Button>
          </div>

          {slackItems.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No Slack integrations configured yet.
            </p>
          ) : (
            <div>
              {slackItems.map((item) => (
                <IntegrationRow
                  key={item.id}
                  name={item.workspaceName}
                  webhookUrl={item.webhookUrl}
                  events={item.events}
                  isActive={item.isActive}
                  createdAt={item.createdAt}
                  onToggle={() => handleToggleSlack(item.id)}
                  onDelete={() => handleDeleteSlack(item.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Discord panel */}
      {tab === "discord" && (
        <div className="space-y-6">
          <div className="rounded-lg border p-4 space-y-4">
            <p className="text-sm font-medium">Add Discord integration</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                placeholder="Channel name (e.g. #alerts)"
                value={discordName}
                onChange={(e) => setDiscordName(e.target.value)}
              />
              <Input
                placeholder="https://discord.com/api/webhooks/…"
                value={discordUrl}
                onChange={(e) => setDiscordUrl(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">
                Listen for
              </p>
              <EventPills
                selected={discordEvents}
                onToggle={(e) =>
                  setDiscordEvents((prev) => {
                    const next = new Set(prev);
                    next.has(e) ? next.delete(e) : next.add(e);
                    return next;
                  })
                }
              />
            </div>
            <Button
              onClick={handleAddDiscord}
              disabled={addingDiscord}
              size="sm"
            >
              <Plus className="h-4 w-4 mr-1" />
              {addingDiscord ? "Adding…" : "Add Discord integration"}
            </Button>
          </div>

          {discordItems.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No Discord integrations configured yet.
            </p>
          ) : (
            <div>
              {discordItems.map((item) => (
                <IntegrationRow
                  key={item.id}
                  name={item.channelName}
                  webhookUrl={item.webhookUrl}
                  events={item.events}
                  isActive={item.isActive}
                  createdAt={item.createdAt}
                  onToggle={() => handleToggleDiscord(item.id)}
                  onDelete={() => handleDeleteDiscord(item.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
