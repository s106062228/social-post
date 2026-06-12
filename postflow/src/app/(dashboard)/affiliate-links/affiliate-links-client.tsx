"use client";

import { useState, useCallback } from "react";
import {
  Link2,
  Plus,
  Trash2,
  Loader2,
  ExternalLink,
  MousePointer,
  DollarSign,
  TrendingUp,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface AffiliateLink {
  id: string;
  name: string;
  originalUrl: string;
  affiliateCode: string | null;
  platform: string | null;
  category: string | null;
  clicks: number;
  conversions: number;
  revenue: number;
  currency: string;
  isActive: boolean;
  createdAt: string;
}

interface Props {
  initialLinks: AffiliateLink[];
}

function formatRevenue(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

function conversionRate(clicks: number, conversions: number): string {
  if (clicks === 0) return "0%";
  return `${((conversions / clicks) * 100).toFixed(1)}%`;
}

export function AffiliateLinksClient({ initialLinks }: Props) {
  const [links, setLinks] = useState<AffiliateLink[]>(initialLinks);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Create form state
  const [name, setName] = useState("");
  const [originalUrl, setOriginalUrl] = useState("");
  const [affiliateCode, setAffiliateCode] = useState("");
  const [platform, setPlatform] = useState("");
  const [category, setCategory] = useState("");
  const [currency, setCurrency] = useState("USD");

  // Edit state
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editActive, setEditActive] = useState(true);

  const totalClicks = links.reduce((s, l) => s + l.clicks, 0);
  const totalConversions = links.reduce((s, l) => s + l.conversions, 0);
  const totalRevenue = links.reduce((s, l) => s + l.revenue, 0);

  const handleCreate = useCallback(async () => {
    if (!name.trim() || !originalUrl.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/affiliate-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          originalUrl: originalUrl.trim(),
          affiliateCode: affiliateCode.trim() || undefined,
          platform: platform.trim() || undefined,
          category: category.trim() || undefined,
          currency,
        }),
      });
      const data = (await res.json()) as { link?: AffiliateLink; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Failed to create affiliate link");
        return;
      }
      setLinks((prev) => [data.link!, ...prev]);
      setName("");
      setOriginalUrl("");
      setAffiliateCode("");
      setPlatform("");
      setCategory("");
      setCurrency("USD");
      setShowForm(false);
      toast.success("Affiliate link created");
    } finally {
      setCreating(false);
    }
  }, [name, originalUrl, affiliateCode, platform, category, currency]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Delete this affiliate link?")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/affiliate-links/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Failed to delete affiliate link");
        return;
      }
      setLinks((prev) => prev.filter((l) => l.id !== id));
      toast.success("Affiliate link deleted");
    } finally {
      setDeleting(null);
    }
  }, []);

  function startEdit(link: AffiliateLink) {
    setEditingId(link.id);
    setEditName(link.name);
    setEditCode(link.affiliateCode ?? "");
    setEditCategory(link.category ?? "");
    setEditActive(link.isActive);
  }

  const handleSaveEdit = useCallback(async (id: string) => {
    const res = await fetch(`/api/affiliate-links/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName.trim(),
        affiliateCode: editCode.trim() || null,
        category: editCategory.trim() || null,
        isActive: editActive,
      }),
    });
    const data = (await res.json()) as { link?: AffiliateLink; error?: string };
    if (!res.ok) {
      toast.error(data.error ?? "Failed to update");
      return;
    }
    setLinks((prev) => prev.map((l) => (l.id === id ? data.link! : l)));
    setEditingId(null);
    toast.success("Updated");
  }, [editName, editCode, editCategory, editActive]);

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      {links.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border bg-card p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs mb-1">
              <MousePointer className="h-3 w-3" /> Total Clicks
            </div>
            <p className="text-xl font-bold">{totalClicks.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border bg-card p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs mb-1">
              <TrendingUp className="h-3 w-3" /> Conversions
            </div>
            <p className="text-xl font-bold">{totalConversions.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{conversionRate(totalClicks, totalConversions)} CVR</p>
          </div>
          <div className="rounded-lg border bg-card p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs mb-1">
              <DollarSign className="h-3 w-3" /> Revenue
            </div>
            <p className="text-xl font-bold">${totalRevenue.toFixed(2)}</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center">
        <span className="text-sm text-muted-foreground">
          {links.length} link{links.length !== 1 ? "s" : ""}
        </span>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="h-4 w-4 mr-1" />
          New Affiliate Link
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
          <h3 className="font-medium text-sm">Add Affiliate Link</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="af-name">Name *</Label>
              <Input
                id="af-name"
                placeholder="Amazon Associates"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="af-code">Affiliate / Referral Code</Label>
              <Input
                id="af-code"
                placeholder="mycode123"
                value={affiliateCode}
                onChange={(e) => setAffiliateCode(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="af-url">Original URL *</Label>
            <Input
              id="af-url"
              type="url"
              placeholder="https://example.com/product"
              value={originalUrl}
              onChange={(e) => setOriginalUrl(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="af-platform">Platform</Label>
              <Input
                id="af-platform"
                placeholder="Amazon, Shopify…"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="af-category">Category</Label>
              <Input
                id="af-category"
                placeholder="Tech, Fashion…"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="af-currency">Currency</Label>
              <Input
                id="af-currency"
                placeholder="USD"
                maxLength={3}
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={creating || !name.trim() || !originalUrl.trim()}
            >
              {creating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Create
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Links list */}
      {links.length === 0 ? (
        <p className="text-center text-muted-foreground py-8 text-sm">
          No affiliate links yet. Add your first one to start tracking.
        </p>
      ) : (
        <div className="space-y-2">
          {links.map((link) => (
            <div key={link.id} className="border rounded-lg p-3 bg-card space-y-2">
              {editingId === link.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs">Name</Label>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-7 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Affiliate Code</Label>
                      <Input
                        value={editCode}
                        onChange={(e) => setEditCode(e.target.value)}
                        className="h-7 text-sm"
                        placeholder="optional"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Category</Label>
                      <Input
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value)}
                        className="h-7 text-sm"
                        placeholder="optional"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editActive}
                      onChange={(e) => setEditActive(e.target.checked)}
                    />
                    Active
                  </label>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleSaveEdit(link.id)}>
                      <Check className="h-3.5 w-3.5 mr-1" /> Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                      <X className="h-3.5 w-3.5 mr-1" /> Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{link.name}</span>
                        {!link.isActive && (
                          <Badge variant="secondary" className="text-xs">Inactive</Badge>
                        )}
                        {link.platform && (
                          <Badge variant="outline" className="text-xs">{link.platform}</Badge>
                        )}
                        {link.category && (
                          <Badge variant="outline" className="text-xs">{link.category}</Badge>
                        )}
                        {link.affiliateCode && (
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                            ref={link.affiliateCode}
                          </code>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate max-w-md mt-0.5">
                        {link.originalUrl}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="Edit"
                        onClick={() => startEdit(link)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="Open URL"
                        asChild
                      >
                        <a href={link.originalUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        title="Delete"
                        disabled={deleting === link.id}
                        onClick={() => handleDelete(link.id)}
                      >
                        {deleting === link.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MousePointer className="h-3 w-3" />
                      {link.clicks.toLocaleString()} clicks
                    </span>
                    <span className="flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />
                      {link.conversions} conversions ({conversionRate(link.clicks, link.conversions)})
                    </span>
                    <span className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      {formatRevenue(link.revenue, link.currency)}
                    </span>
                    <span>
                      Added {formatDistanceToNow(new Date(link.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
