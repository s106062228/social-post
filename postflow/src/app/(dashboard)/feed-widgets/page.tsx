"use client";

import { useState, useEffect, useCallback } from "react";
import { LayoutGrid, Plus, Trash2, Loader2, Copy, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

interface FeedWidget {
  id: string;
  name: string;
  accountIds: string[];
  maxPosts: number;
  theme: string;
  showPlatformIcons: boolean;
  showTimestamps: boolean;
  createdAt: string;
}

export default function FeedWidgetsPage() {
  const [widgets, setWidgets] = useState<FeedWidget[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Create form state
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAccountIds, setNewAccountIds] = useState("");
  const [newMaxPosts, setNewMaxPosts] = useState("10");
  const [newTheme, setNewTheme] = useState<"light" | "dark">("light");
  const [newShowIcons, setNewShowIcons] = useState(true);
  const [newShowTimestamps, setNewShowTimestamps] = useState(true);

  const fetchWidgets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/feed-widgets");
      if (!res.ok) throw new Error("Failed to load");
      const data = (await res.json()) as { widgets: FeedWidget[] };
      setWidgets(data.widgets);
    } catch {
      toast({ title: "Error", description: "Could not load feed widgets.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchWidgets();
  }, [fetchWidgets]);

  async function handleCreate() {
    const accountIds = newAccountIds
      .split(/[\n,]+/)
      .map((s: string) => s.trim())
      .filter(Boolean);

    if (!newName.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    if (accountIds.length === 0) {
      toast({ title: "At least one account ID required", variant: "destructive" });
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/feed-widgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          accountIds,
          maxPosts: parseInt(newMaxPosts, 10) || 10,
          theme: newTheme,
          showPlatformIcons: newShowIcons,
          showTimestamps: newShowTimestamps,
        }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        throw new Error(d.error ?? "Failed to create");
      }
      toast({ title: "Widget created" });
      setNewName("");
      setNewAccountIds("");
      setNewMaxPosts("10");
      setNewTheme("light");
      setNewShowIcons(true);
      setNewShowTimestamps(true);
      setShowForm(false);
      await fetchWidgets();
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to create widget",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this feed widget?")) return;
    try {
      const res = await fetch(`/api/feed-widgets/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      toast({ title: "Widget deleted" });
      setWidgets((prev: FeedWidget[]) => prev.filter((w: FeedWidget) => w.id !== id));
    } catch {
      toast({ title: "Error", description: "Could not delete widget.", variant: "destructive" });
    }
  }

  function getWidgetUrl(id: string) {
    return `${window.location.origin}/widget/${id}`;
  }

  function getEmbedCode(id: string) {
    const url = getWidgetUrl(id);
    return `<iframe src="${url}" width="100%" height="600" frameborder="0" loading="lazy"></iframe>`;
  }

  async function handleCopyEmbed(id: string) {
    try {
      await navigator.clipboard.writeText(getEmbedCode(id));
      setCopiedId(id);
      toast({ title: "Embed code copied!" });
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Feed Widgets</h1>
        </div>
        <Button onClick={() => setShowForm((v: boolean) => !v)} variant="outline" size="sm">
          <Plus className="h-4 w-4 mr-1" /> New Widget
        </Button>
      </div>

      <p className="text-muted-foreground text-sm">
        Embed a live feed of your published posts anywhere using an iframe.
      </p>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Create Feed Widget</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>Widget Name</Label>
              <Input
                placeholder="My Blog Feed"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Account IDs (one per line or comma-separated)</Label>
              <textarea
                className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="account-id-1&#10;account-id-2"
                value={newAccountIds}
                onChange={(e) => setNewAccountIds(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Use the account IDs from your connected social accounts.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Max Posts</Label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={newMaxPosts}
                  onChange={(e) => setNewMaxPosts(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Theme</Label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={newTheme}
                  onChange={(e) => setNewTheme(e.target.value as "light" | "dark")}
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={newShowIcons}
                  onChange={(e) => setNewShowIcons(e.target.checked)}
                />
                Show Platform Icons
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={newShowTimestamps}
                  onChange={(e) => setNewShowTimestamps(e.target.checked)}
                />
                Show Timestamps
              </label>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => void handleCreate()} disabled={creating}>
                {creating && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Create Widget
              </Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : widgets.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <LayoutGrid className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p className="text-lg font-medium">No feed widgets yet</p>
          <p className="text-sm mt-1">Create one to embed your posts on any website.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {widgets.map((widget) => (
            <Card key={widget.id}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{widget.name}</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      <Badge variant="secondary">{widget.theme} theme</Badge>
                      <Badge variant="secondary">max {widget.maxPosts} posts</Badge>
                      <Badge variant="secondary">
                        {widget.accountIds.length} account
                        {widget.accountIds.length !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      asChild
                      title="Preview widget"
                    >
                      <a
                        href={`/widget/${widget.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Copy embed code"
                      onClick={() => void handleCopyEmbed(widget.id)}
                    >
                      {copiedId === widget.id ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Delete widget"
                      onClick={() => void handleDelete(widget.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <div className="rounded-md bg-muted p-2 text-xs font-mono break-all select-all">
                  {getEmbedCode(widget.id)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
