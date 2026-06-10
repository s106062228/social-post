"use client";

import { useState, useEffect, useCallback } from "react";
import { Swords, Plus, Trash2, Loader2, ExternalLink, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const PLATFORMS = [
  "FACEBOOK", "INSTAGRAM", "THREADS", "TWITTER", "LINKEDIN",
  "TIKTOK", "YOUTUBE", "PINTEREST", "BLUESKY", "MASTODON",
  "TELEGRAM", "REDDIT", "TUMBLR", "MEDIUM", "GHOST", "DEVTO",
  "HASHNODE", "BEEHIIV", "PIXELFED", "VIMEO", "NOSTR",
  "WORDPRESS", "GOOGLE_BUSINESS",
] as const;

type Platform = typeof PLATFORMS[number];

interface CompetitorSnapshot {
  id: string;
  followersCount: number | null;
  avgEngagementRate: number | null;
  postsPerWeek: number | null;
  avgLikes: number | null;
  avgComments: number | null;
  recordedAt: string;
}

interface Competitor {
  id: string;
  name: string;
  platform: Platform;
  handle: string;
  profileUrl: string | null;
  notes: string | null;
  snapshots: CompetitorSnapshot[];
  createdAt: string;
}

interface SnapshotFormState {
  followersCount: string;
  avgEngagementRate: string;
  postsPerWeek: string;
  avgLikes: string;
  avgComments: string;
}

const defaultSnapshotForm = (): SnapshotFormState => ({
  followersCount: "",
  avgEngagementRate: "",
  postsPerWeek: "",
  avgLikes: "",
  avgComments: "",
});

function fmt(val: number | null, decimals = 0): string {
  if (val === null) return "—";
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return decimals > 0 ? val.toFixed(decimals) : val.toLocaleString();
}

export default function CompetitorsPage() {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [snapshotOpen, setSnapshotOpen] = useState<string | null>(null);
  const [snapshotForm, setSnapshotForm] = useState<SnapshotFormState>(defaultSnapshotForm());
  const [snapshotSubmitting, setSnapshotSubmitting] = useState(false);

  const [form, setForm] = useState({
    name: "",
    platform: "INSTAGRAM" as Platform,
    handle: "",
    profileUrl: "",
    notes: "",
  });

  const fetchCompetitors = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/competitor-accounts");
      if (!res.ok) throw new Error("Failed to load competitors");
      const data = (await res.json()) as { competitors: Competitor[] };
      setCompetitors(data.competitors);
    } catch {
      toast.error("Failed to load competitors");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompetitors();
  }, [fetchCompetitors]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.handle.trim()) {
      toast.error("Name and handle are required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/competitor-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          platform: form.platform,
          handle: form.handle.trim(),
          profileUrl: form.profileUrl.trim() || undefined,
          notes: form.notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        toast.error(err.error ?? "Failed to add competitor");
        return;
      }
      const competitor = (await res.json()) as Competitor;
      setCompetitors((prev) => [competitor, ...prev]);
      setForm({ name: "", platform: "INSTAGRAM", handle: "", profileUrl: "", notes: "" });
      setShowForm(false);
      toast.success("Competitor added");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this competitor?")) return;
    try {
      const res = await fetch(`/api/competitor-accounts/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        toast.error("Failed to delete competitor");
        return;
      }
      setCompetitors((prev) => prev.filter((c) => c.id !== id));
      toast.success("Competitor deleted");
    } catch {
      toast.error("Failed to delete competitor");
    }
  }

  async function handleSnapshot(competitorId: string) {
    setSnapshotSubmitting(true);
    try {
      const body: Record<string, number> = {};
      if (snapshotForm.followersCount) body.followersCount = parseInt(snapshotForm.followersCount, 10);
      if (snapshotForm.avgEngagementRate) body.avgEngagementRate = parseFloat(snapshotForm.avgEngagementRate);
      if (snapshotForm.postsPerWeek) body.postsPerWeek = parseFloat(snapshotForm.postsPerWeek);
      if (snapshotForm.avgLikes) body.avgLikes = parseFloat(snapshotForm.avgLikes);
      if (snapshotForm.avgComments) body.avgComments = parseFloat(snapshotForm.avgComments);

      const res = await fetch(`/api/competitor-accounts/${competitorId}/snapshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        toast.error("Failed to record snapshot");
        return;
      }
      const snapshot = (await res.json()) as CompetitorSnapshot;
      setCompetitors((prev) =>
        prev.map((c) =>
          c.id === competitorId ? { ...c, snapshots: [snapshot, ...c.snapshots] } : c
        )
      );
      setSnapshotForm(defaultSnapshotForm());
      setSnapshotOpen(null);
      toast.success("Snapshot recorded");
    } finally {
      setSnapshotSubmitting(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Swords className="h-6 w-6" />
            Competitors
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track competitor accounts and record performance snapshots.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Competitor
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New Competitor</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium mb-1 block">Name *</label>
                  <Input
                    placeholder="Brand name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">Platform *</label>
                  <select
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    value={form.platform}
                    onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value as Platform }))}
                  >
                    {PLATFORMS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">Handle *</label>
                  <Input
                    placeholder="@username"
                    value={form.handle}
                    onChange={(e) => setForm((f) => ({ ...f, handle: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">Profile URL</label>
                  <Input
                    placeholder="https://..."
                    value={form.profileUrl}
                    onChange={(e) => setForm((f) => ({ ...f, profileUrl: e.target.value }))}
                    type="url"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Notes</label>
                <Textarea
                  placeholder="Optional notes..."
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Add Competitor
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : competitors.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Swords className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No competitors tracked yet</p>
            <p className="text-sm mt-1">Add competitors to start benchmarking.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {competitors.map((c) => {
            const latest = c.snapshots[0] ?? null;
            const isSnapshotFormOpen = snapshotOpen === c.id;

            return (
              <Card key={c.id}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{c.name}</span>
                        <Badge variant="secondary">{c.platform}</Badge>
                        <span className="text-sm text-muted-foreground">@{c.handle}</span>
                        {c.profileUrl && (
                          <a
                            href={c.profileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-500 hover:underline flex items-center gap-0.5"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Profile
                          </a>
                        )}
                      </div>
                      {c.notes && (
                        <p className="text-xs text-muted-foreground mt-1">{c.notes}</p>
                      )}
                      {latest && (
                        <div className="flex flex-wrap gap-4 mt-2 text-sm">
                          <div>
                            <span className="text-xs text-muted-foreground">Followers</span>
                            <p className="font-medium">{fmt(latest.followersCount)}</p>
                          </div>
                          <div>
                            <span className="text-xs text-muted-foreground">Eng. Rate</span>
                            <p className="font-medium">
                              {latest.avgEngagementRate !== null
                                ? `${latest.avgEngagementRate.toFixed(2)}%`
                                : "—"}
                            </p>
                          </div>
                          <div>
                            <span className="text-xs text-muted-foreground">Posts/Wk</span>
                            <p className="font-medium">
                              {latest.postsPerWeek !== null
                                ? latest.postsPerWeek.toFixed(1)
                                : "—"}
                            </p>
                          </div>
                          <div>
                            <span className="text-xs text-muted-foreground">Avg Likes</span>
                            <p className="font-medium">{fmt(latest.avgLikes)}</p>
                          </div>
                          <div>
                            <span className="text-xs text-muted-foreground">Avg Comments</span>
                            <p className="font-medium">{fmt(latest.avgComments)}</p>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        onClick={() => {
                          setSnapshotOpen((prev) => (prev === c.id ? null : c.id));
                          setSnapshotForm(defaultSnapshotForm());
                        }}
                      >
                        <Camera className="h-3 w-3" />
                        Snapshot
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(c.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {isSnapshotFormOpen && (
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-sm font-medium mb-3">Record Snapshot</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="text-xs text-muted-foreground block mb-1">
                            Followers
                          </label>
                          <Input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={snapshotForm.followersCount}
                            onChange={(e) =>
                              setSnapshotForm((f) => ({ ...f, followersCount: e.target.value }))
                            }
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground block mb-1">
                            Eng. Rate (%)
                          </label>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            placeholder="0.00"
                            value={snapshotForm.avgEngagementRate}
                            onChange={(e) =>
                              setSnapshotForm((f) => ({
                                ...f,
                                avgEngagementRate: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground block mb-1">
                            Posts/Week
                          </label>
                          <Input
                            type="number"
                            min="0"
                            step="0.1"
                            placeholder="0"
                            value={snapshotForm.postsPerWeek}
                            onChange={(e) =>
                              setSnapshotForm((f) => ({ ...f, postsPerWeek: e.target.value }))
                            }
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground block mb-1">
                            Avg Likes
                          </label>
                          <Input
                            type="number"
                            min="0"
                            step="0.1"
                            placeholder="0"
                            value={snapshotForm.avgLikes}
                            onChange={(e) =>
                              setSnapshotForm((f) => ({ ...f, avgLikes: e.target.value }))
                            }
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground block mb-1">
                            Avg Comments
                          </label>
                          <Input
                            type="number"
                            min="0"
                            step="0.1"
                            placeholder="0"
                            value={snapshotForm.avgComments}
                            onChange={(e) =>
                              setSnapshotForm((f) => ({
                                ...f,
                                avgComments: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 mt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSnapshotOpen(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          disabled={snapshotSubmitting}
                          onClick={() => handleSnapshot(c.id)}
                        >
                          {snapshotSubmitting && (
                            <Loader2 className="h-3 w-3 animate-spin mr-2" />
                          )}
                          Save Snapshot
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
