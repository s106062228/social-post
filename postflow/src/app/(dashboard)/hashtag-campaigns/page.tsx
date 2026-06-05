"use client";

import { useState, useEffect, useCallback } from "react";
import { Hash, Plus, Trash2, Loader2, BarChart2, ToggleLeft, ToggleRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import Link from "next/link";

interface HashtagCampaign {
  id: string;
  name: string;
  hashtags: string[];
  startDate: string;
  endDate: string | null;
  targetPlatforms: string[];
  goal: string | null;
  isActive: boolean;
  createdAt: string;
}

export default function HashtagCampaignsPage() {
  const [campaigns, setCampaigns] = useState<HashtagCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [hashtagsInput, setHashtagsInput] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [goal, setGoal] = useState("");

  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await fetch("/api/hashtag-campaigns");
      if (!res.ok) throw new Error("Failed to load campaigns");
      const data = await res.json() as { campaigns: HashtagCampaign[] };
      setCampaigns(data.campaigns);
    } catch {
      toast.error("Failed to load hashtag campaigns");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCampaigns();
  }, [fetchCampaigns]);

  async function handleCreate() {
    if (!name.trim()) {
      toast.error("Campaign name is required");
      return;
    }
    if (!startDate) {
      toast.error("Start date is required");
      return;
    }
    const hashtags = hashtagsInput
      .split(",")
      .map((h) => h.trim().replace(/^#/, ""))
      .filter(Boolean);
    if (hashtags.length === 0) {
      toast.error("At least one hashtag is required");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/hashtag-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          hashtags,
          startDate: new Date(startDate).toISOString(),
          endDate: endDate ? new Date(endDate).toISOString() : undefined,
          goal: goal.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        toast.error(err.error ?? "Failed to create campaign");
        return;
      }
      toast.success("Campaign created");
      setName("");
      setHashtagsInput("");
      setStartDate("");
      setEndDate("");
      setGoal("");
      setShowForm(false);
      await fetchCampaigns();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggle(id: string, isActive: boolean) {
    try {
      const res = await fetch(`/api/hashtag-campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      });
      if (!res.ok) throw new Error();
      setCampaigns((prev) =>
        prev.map((c) => (c.id === id ? { ...c, isActive: !isActive } : c))
      );
      toast.success(isActive ? "Campaign paused" : "Campaign resumed");
    } catch {
      toast.error("Failed to update campaign");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this hashtag campaign?")) return;
    try {
      const res = await fetch(`/api/hashtag-campaigns/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setCampaigns((prev) => prev.filter((c) => c.id !== id));
      toast.success("Campaign deleted");
    } catch {
      toast.error("Failed to delete campaign");
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Hash className="h-6 w-6 text-purple-500" />
          <h1 className="text-2xl font-bold">Hashtag Campaigns</h1>
        </div>
        <Button onClick={() => setShowForm((s) => !s)} variant="default" size="sm">
          <Plus className="h-4 w-4 mr-1" />
          New Campaign
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create Hashtag Campaign</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Campaign Name</label>
              <Input
                placeholder="e.g. Summer Launch 2026"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Hashtags (comma-separated)</label>
              <Input
                placeholder="e.g. summersale, newlaunch, promo2026"
                value={hashtagsInput}
                onChange={(e) => setHashtagsInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Enter hashtags without # prefix, comma-separated
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Start Date</label>
                <Input
                  type="datetime-local"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">End Date (optional)</label>
                <Input
                  type="datetime-local"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Campaign Goal (optional)</label>
              <Textarea
                placeholder="Describe the goal of this campaign..."
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                rows={2}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Create Campaign
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : campaigns.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Hash className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No hashtag campaigns yet</p>
            <p className="text-sm mt-1">Create a campaign to track your hashtag performance.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign) => (
            <Card key={campaign.id} className={campaign.isActive ? "" : "opacity-60"}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold truncate">{campaign.name}</h3>
                      <Badge variant={campaign.isActive ? "default" : "secondary"}>
                        {campaign.isActive ? "Active" : "Paused"}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {(campaign.hashtags as string[]).map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs font-mono">
                          #{tag}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(campaign.startDate).toLocaleDateString()}
                      {campaign.endDate
                        ? ` → ${new Date(campaign.endDate).toLocaleDateString()}`
                        : " → ongoing"}
                    </p>
                    {campaign.goal && (
                      <p className="text-sm text-muted-foreground mt-1 truncate">{campaign.goal}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Link href={`/hashtag-campaigns/${campaign.id}`}>
                      <Button variant="outline" size="sm">
                        <BarChart2 className="h-4 w-4 mr-1" />
                        Performance
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggle(campaign.id, campaign.isActive)}
                    >
                      {campaign.isActive ? (
                        <ToggleRight className="h-4 w-4 text-green-500" />
                      ) : (
                        <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(campaign.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
