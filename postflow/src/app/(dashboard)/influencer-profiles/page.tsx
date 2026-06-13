"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Users, Plus, Trash2, ExternalLink, Handshake, Search,
} from "lucide-react";
import { toast } from "sonner";

const OUTREACH_STATUSES = [
  "ALL", "PROSPECT", "CONTACTED", "RESPONDED", "NEGOTIATING", "AGREED", "COMPLETED", "DECLINED",
] as const;

const STATUS_COLORS: Record<string, string> = {
  PROSPECT: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  CONTACTED: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  RESPONDED: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  NEGOTIATING: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  AGREED: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  COMPLETED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  DECLINED: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

interface InfluencerProfile {
  id: string;
  name: string;
  handle: string;
  platform: string | null;
  followerCount: number | null;
  engagementRate: number | null;
  niche: string | null;
  email: string | null;
  profileUrl: string | null;
  outreachStatus: string;
  notes: string | null;
  lastContactedAt: string | null;
  createdAt: string;
}

function formatFollowers(count: number | null): string {
  if (count === null) return "—";
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
}

export default function InfluencerProfilesPage() {
  const [profiles, setProfiles] = useState<InfluencerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStatus, setActiveStatus] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [creatingCollab, setCreatingCollab] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({
    name: "", handle: "", platform: "", followerCount: "",
    engagementRate: "", niche: "", email: "", profileUrl: "",
    outreachStatus: "PROSPECT", notes: "",
  });

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeStatus !== "ALL") params.set("status", activeStatus);
      if (search) params.set("search", search);
      const res = await fetch(`/api/influencer-profiles?${params}`);
      if (res.ok) {
        const data = await res.json();
        setProfiles(data.profiles);
      }
    } finally {
      setLoading(false);
    }
  }, [activeStatus, search]);

  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        name: form.name,
        handle: form.handle,
        outreachStatus: form.outreachStatus,
      };
      if (form.platform) body.platform = form.platform;
      if (form.followerCount) body.followerCount = parseInt(form.followerCount, 10);
      if (form.engagementRate) body.engagementRate = parseFloat(form.engagementRate);
      if (form.niche) body.niche = form.niche;
      if (form.email) body.email = form.email;
      if (form.profileUrl) body.profileUrl = form.profileUrl;
      if (form.notes) body.notes = form.notes;

      const res = await fetch("/api/influencer-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Failed to create profile");
        return;
      }
      toast.success("Influencer profile created");
      setForm({ name: "", handle: "", platform: "", followerCount: "", engagementRate: "", niche: "", email: "", profileUrl: "", outreachStatus: "PROSPECT", notes: "" });
      setShowForm(false);
      fetchProfiles();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(id: string, status: string) {
    const res = await fetch(`/api/influencer-profiles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outreachStatus: status }),
    });
    if (!res.ok) {
      toast.error("Failed to update status");
      return;
    }
    toast.success("Status updated");
    fetchProfiles();
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      const res = await fetch(`/api/influencer-profiles/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Failed to delete");
        return;
      }
      toast.success("Profile deleted");
      fetchProfiles();
    } finally {
      setDeleting(null);
    }
  }

  async function handleCreateCollaboration(id: string) {
    setCreatingCollab(id);
    try {
      const res = await fetch(`/api/influencer-profiles/${id}/create-collaboration`, {
        method: "POST",
      });
      if (!res.ok) {
        toast.error("Failed to create collaboration");
        return;
      }
      const data = await res.json();
      toast.success("Collaboration created! Status updated to Agreed.");
      window.location.href = `/collaborations/${data.collaborationId}`;
    } finally {
      setCreatingCollab(null);
    }
  }

  const PLATFORMS = [
    "FACEBOOK", "INSTAGRAM", "THREADS", "LINKEDIN", "PINTEREST",
    "YOUTUBE", "TIKTOK", "TWITTER", "BLUESKY", "MASTODON",
    "TELEGRAM", "REDDIT", "TUMBLR", "MEDIUM", "DEVTO", "HASHNODE",
  ];

  return (
    <div className="flex flex-col gap-8 p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Users className="h-8 w-8" />
            Influencer Outreach
          </h1>
          <p className="text-muted-foreground mt-1">
            Track and manage your influencer research and outreach pipeline.
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Influencer
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Add New Influencer</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Name *</Label>
                <Input
                  required
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Influencer's display name"
                />
              </div>
              <div>
                <Label>Handle *</Label>
                <Input
                  required
                  value={form.handle}
                  onChange={e => setForm(f => ({ ...f, handle: e.target.value }))}
                  placeholder="@username"
                />
              </div>
              <div>
                <Label>Platform</Label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  value={form.platform}
                  onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
                >
                  <option value="">— Select platform —</option>
                  {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <Label>Outreach Status</Label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  value={form.outreachStatus}
                  onChange={e => setForm(f => ({ ...f, outreachStatus: e.target.value }))}
                >
                  {OUTREACH_STATUSES.filter(s => s !== "ALL").map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Follower Count</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.followerCount}
                  onChange={e => setForm(f => ({ ...f, followerCount: e.target.value }))}
                  placeholder="e.g. 50000"
                />
              </div>
              <div>
                <Label>Engagement Rate (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={form.engagementRate}
                  onChange={e => setForm(f => ({ ...f, engagementRate: e.target.value }))}
                  placeholder="e.g. 3.5"
                />
              </div>
              <div>
                <Label>Niche</Label>
                <Input
                  value={form.niche}
                  onChange={e => setForm(f => ({ ...f, niche: e.target.value }))}
                  placeholder="e.g. Tech, Fashion, Fitness"
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="contact@example.com"
                />
              </div>
              <div className="md:col-span-2">
                <Label>Profile URL</Label>
                <Input
                  type="url"
                  value={form.profileUrl}
                  onChange={e => setForm(f => ({ ...f, profileUrl: e.target.value }))}
                  placeholder="https://instagram.com/..."
                />
              </div>
              <div className="md:col-span-2">
                <Label>Notes</Label>
                <textarea
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background resize-none"
                  rows={2}
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Any additional notes..."
                />
              </div>
              <div className="md:col-span-2 flex gap-2">
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Creating…" : "Create Profile"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by name, handle, or niche…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {OUTREACH_STATUSES.map(s => (
            <button
              key={s}
              onClick={() => setActiveStatus(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                activeStatus === s
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary"
              }`}
            >
              {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : profiles.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <Users className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">
              {activeStatus !== "ALL" || search
                ? "No influencers match your filters."
                : "No influencers yet. Add your first one above."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-left">
                  <th className="px-4 py-3 font-medium">Influencer</th>
                  <th className="px-4 py-3 font-medium">Platform</th>
                  <th className="px-4 py-3 font-medium">Followers</th>
                  <th className="px-4 py-3 font-medium">Eng. Rate</th>
                  <th className="px-4 py-3 font-medium">Niche</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Last Contact</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map(profile => (
                  <tr key={profile.id} className="border-b hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium">{profile.name}</div>
                      <div className="text-muted-foreground text-xs flex items-center gap-1">
                        {profile.handle}
                        {profile.profileUrl && (
                          <a href={profile.profileUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3 w-3 inline" />
                          </a>
                        )}
                      </div>
                      {profile.email && (
                        <div className="text-muted-foreground text-xs">{profile.email}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {profile.platform ? (
                        <Badge variant="outline" className="text-xs">
                          {profile.platform}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {formatFollowers(profile.followerCount)}
                    </td>
                    <td className="px-4 py-3">
                      {profile.engagementRate !== null
                        ? `${profile.engagementRate.toFixed(2)}%`
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {profile.niche ? (
                        <Badge variant="secondary" className="text-xs">{profile.niche}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        className={`text-xs rounded-full px-2 py-1 border-0 font-medium cursor-pointer ${STATUS_COLORS[profile.outreachStatus] ?? ""}`}
                        value={profile.outreachStatus}
                        onChange={e => handleStatusChange(profile.id, e.target.value)}
                      >
                        {OUTREACH_STATUSES.filter(s => s !== "ALL").map(s => (
                          <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {profile.lastContactedAt
                        ? new Date(profile.lastContactedAt).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {(profile.outreachStatus === "AGREED" ||
                          profile.outreachStatus === "COMPLETED") && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={creatingCollab === profile.id}
                            onClick={() => handleCreateCollaboration(profile.id)}
                          >
                            <Handshake className="h-3 w-3 mr-1" />
                            {creatingCollab === profile.id ? "Creating…" : "Collaborate"}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          disabled={deleting === profile.id}
                          onClick={() => handleDelete(profile.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Stats summary */}
      {profiles.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          {(["PROSPECT", "CONTACTED", "NEGOTIATING", "AGREED"] as const).map(s => {
            const count = profiles.filter(p => p.outreachStatus === s).length;
            return (
              <div key={s} className="bg-card border rounded-lg p-3 text-center">
                <div className="text-2xl font-bold">{count}</div>
                <div className="text-muted-foreground text-xs mt-0.5">
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
