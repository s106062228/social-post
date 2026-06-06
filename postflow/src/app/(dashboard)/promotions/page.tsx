"use client";

import { useState, useEffect, useCallback } from "react";
import { BadgeDollarSign, Plus, Trash2, Loader2, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const ALL_PLATFORMS = [
  "FACEBOOK",
  "INSTAGRAM",
  "THREADS",
  "LINKEDIN",
  "PINTEREST",
  "YOUTUBE",
  "TIKTOK",
  "TWITTER",
  "BLUESKY",
  "MASTODON",
  "TELEGRAM",
  "REDDIT",
  "NOSTR",
  "TUMBLR",
  "WORDPRESS",
  "MEDIUM",
  "GHOST",
  "DEVTO",
  "GOOGLE_BUSINESS",
  "HASHNODE",
  "BEEHIIV",
  "PIXELFED",
  "VIMEO",
] as const;

const PLATFORM_LABELS: Record<string, string> = {
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  THREADS: "Threads",
  LINKEDIN: "LinkedIn",
  PINTEREST: "Pinterest",
  YOUTUBE: "YouTube",
  TIKTOK: "TikTok",
  TWITTER: "X (Twitter)",
  BLUESKY: "Bluesky",
  MASTODON: "Mastodon",
  TELEGRAM: "Telegram",
  REDDIT: "Reddit",
  NOSTR: "Nostr",
  TUMBLR: "Tumblr",
  WORDPRESS: "WordPress",
  MEDIUM: "Medium",
  GHOST: "Ghost",
  DEVTO: "Dev.to",
  GOOGLE_BUSINESS: "Google Business",
  HASHNODE: "Hashnode",
  BEEHIIV: "Beehiiv",
  PIXELFED: "Pixelfed",
  VIMEO: "Vimeo",
};

const STATUS_VALUES = ["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"] as const;
type PromotionStatus = (typeof STATUS_VALUES)[number];

const STATUS_LABELS: Record<PromotionStatus, string> = {
  PLANNED: "Planned",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const STATUS_BADGE_VARIANT: Record<
  PromotionStatus,
  "default" | "secondary" | "destructive" | "outline" | "success" | "warning"
> = {
  PLANNED: "outline",
  ACTIVE: "success",
  COMPLETED: "secondary",
  CANCELLED: "destructive",
};

interface Promotion {
  id: string;
  postId: string | null;
  platform: string;
  campaignName: string;
  budget: number;
  spend: number;
  currency: string;
  startDate: string;
  endDate: string | null;
  goal: string | null;
  status: PromotionStatus;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  post: { id: string; content: string } | null;
}

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function utilizationBarColor(pct: number): string {
  if (pct > 100) return "bg-red-500";
  if (pct >= 80) return "bg-yellow-500";
  return "bg-green-500";
}

export default function PromotionsPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [campaignName, setCampaignName] = useState("");
  const [platform, setPlatform] = useState<string>("FACEBOOK");
  const [budget, setBudget] = useState("");
  const [spend, setSpend] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState<PromotionStatus>("PLANNED");
  const [goal, setGoal] = useState("");
  const [notes, setNotes] = useState("");
  const [impressions, setImpressions] = useState("");
  const [clicks, setClicks] = useState("");
  const [conversions, setConversions] = useState("");

  const fetchPromotions = useCallback(async () => {
    try {
      const res = await fetch("/api/promotions");
      if (!res.ok) throw new Error("Failed to load promotions");
      const data = (await res.json()) as { items: Promotion[] };
      setPromotions(data.items);
    } catch {
      toast.error("Failed to load promotions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPromotions();
  }, [fetchPromotions]);

  function resetForm() {
    setCampaignName("");
    setPlatform("FACEBOOK");
    setBudget("");
    setSpend("");
    setCurrency("USD");
    setStartDate("");
    setEndDate("");
    setStatus("PLANNED");
    setGoal("");
    setNotes("");
    setImpressions("");
    setClicks("");
    setConversions("");
  }

  async function handleCreate() {
    if (!campaignName.trim()) {
      toast.error("Campaign name is required");
      return;
    }
    if (!startDate) {
      toast.error("Start date is required");
      return;
    }
    const budgetNum = Number(budget);
    if (!budget || Number.isNaN(budgetNum) || budgetNum < 0) {
      toast.error("Enter a valid budget");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignName: campaignName.trim(),
          platform,
          budget: budgetNum,
          spend: spend ? Number(spend) : undefined,
          currency: currency.trim() || undefined,
          startDate: new Date(startDate).toISOString(),
          endDate: endDate ? new Date(endDate).toISOString() : undefined,
          status,
          goal: goal.trim() || undefined,
          notes: notes.trim() || undefined,
          impressions: impressions ? Number(impressions) : undefined,
          clicks: clicks ? Number(clicks) : undefined,
          conversions: conversions ? Number(conversions) : undefined,
        }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        toast.error(err.error ?? "Failed to create promotion");
        return;
      }
      toast.success("Promotion created");
      resetForm();
      setShowForm(false);
      await fetchPromotions();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(id: string, newStatus: PromotionStatus) {
    try {
      const res = await fetch(`/api/promotions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error();
      setPromotions((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status: newStatus } : p))
      );
      toast.success("Status updated");
    } catch {
      toast.error("Failed to update status");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this promotion?")) return;
    try {
      const res = await fetch(`/api/promotions/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setPromotions((prev) => prev.filter((p) => p.id !== id));
      toast.success("Promotion deleted");
    } catch {
      toast.error("Failed to delete promotion");
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BadgeDollarSign className="h-6 w-6 text-emerald-500" />
          <h1 className="text-2xl font-bold">Promotions</h1>
        </div>
        <Button onClick={() => setShowForm((s) => !s)} variant="default" size="sm">
          <Plus className="h-4 w-4 mr-1" />
          New Promotion
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create Paid Promotion</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Campaign Name</label>
              <Input
                placeholder="e.g. Spring Sale Boost"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Platform</label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                >
                  {ALL_PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {PLATFORM_LABELS[p]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as PromotionStatus)}
                >
                  {STATUS_VALUES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Budget</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="500.00"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Spend (optional)</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={spend}
                  onChange={(e) => setSpend(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Currency</label>
                <Input
                  placeholder="USD"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                />
              </div>
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
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Impressions (optional)</label>
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={impressions}
                  onChange={(e) => setImpressions(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Clicks (optional)</label>
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={clicks}
                  onChange={(e) => setClicks(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Conversions (optional)</label>
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={conversions}
                  onChange={(e) => setConversions(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Goal (optional)</label>
              <Textarea
                placeholder="Describe the goal of this promotion..."
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                rows={2}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Notes (optional)</label>
              <Textarea
                placeholder="Internal notes about this campaign..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Create Promotion
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
      ) : promotions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Megaphone className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No promotions yet</p>
            <p className="text-sm mt-1">Track your paid ad spend and ROI by creating a promotion.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {promotions.map((promo) => {
            const utilization = promo.budget > 0 ? (promo.spend / promo.budget) * 100 : 0;
            return (
              <Card key={promo.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-semibold truncate">{promo.campaignName}</h3>
                        <Badge variant="outline" className="text-xs">
                          {PLATFORM_LABELS[promo.platform] ?? promo.platform}
                        </Badge>
                        <Badge variant={STATUS_BADGE_VARIANT[promo.status]}>
                          {STATUS_LABELS[promo.status]}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(promo.startDate).toLocaleDateString()}
                        {promo.endDate
                          ? ` → ${new Date(promo.endDate).toLocaleDateString()}`
                          : " → ongoing"}
                      </p>

                      <div className="mt-3 max-w-sm">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-muted-foreground">
                            {formatCurrency(promo.spend, promo.currency)} of{" "}
                            {formatCurrency(promo.budget, promo.currency)} spent
                          </span>
                          <span className="font-medium">{utilization.toFixed(0)}%</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${utilizationBarColor(utilization)}`}
                            style={{ width: `${Math.min(utilization, 100)}%` }}
                          />
                        </div>
                      </div>

                      {(promo.impressions !== null ||
                        promo.clicks !== null ||
                        promo.conversions !== null) && (
                        <div className="flex flex-wrap gap-1 mt-3">
                          {promo.impressions !== null && (
                            <Badge variant="secondary" className="text-xs font-mono">
                              {promo.impressions.toLocaleString()} impressions
                            </Badge>
                          )}
                          {promo.clicks !== null && (
                            <Badge variant="secondary" className="text-xs font-mono">
                              {promo.clicks.toLocaleString()} clicks
                            </Badge>
                          )}
                          {promo.conversions !== null && (
                            <Badge variant="secondary" className="text-xs font-mono">
                              {promo.conversions.toLocaleString()} conversions
                            </Badge>
                          )}
                        </div>
                      )}

                      {promo.goal && (
                        <p className="text-sm text-muted-foreground mt-2 truncate">{promo.goal}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <select
                        className="rounded-md border bg-background px-2 py-1 text-xs"
                        value={promo.status}
                        onChange={(e) =>
                          handleStatusChange(promo.id, e.target.value as PromotionStatus)
                        }
                      >
                        {STATUS_VALUES.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABELS[s]}
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(promo.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
