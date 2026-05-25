"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Link2,
  Plus,
  Trash2,
  Loader2,
  ExternalLink,
  Copy,
  Check,
  Eye,
  EyeOff,
  Pencil,
  X,
  MousePointerClick,
  QrCode,
  BarChart2,
  Download,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

interface LinkBioItem {
  id: string;
  label: string;
  url: string;
  icon: string | null;
  order: number;
  isActive: boolean;
  clicks: number;
  createdAt: string;
  updatedAt: string;
}

interface LinkBioPage {
  id: string;
  slug: string;
  title: string;
  bio: string | null;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { items: number };
  items?: LinkBioItem[];
}

interface AnalyticsData {
  pageId: string;
  slug: string;
  title: string;
  totalClicks: number;
  items: {
    itemId: string;
    label: string;
    url: string;
    clicks: number;
    clicksLast7d: number;
    clicksTotal: number;
  }[];
  dailyClicks: { date: string; count: number }[];
  deviceBreakdown: { device: string; count: number }[];
}

export default function BioPagesPage() {
  const [pages, setPages] = useState<LinkBioPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedPage, setExpandedPage] = useState<LinkBioPage | null>(null);
  const [loadingExpanded, setLoadingExpanded] = useState(false);

  // Analytics state
  const [analyticsPageId, setAnalyticsPageId] = useState<string | null>(null);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  // QR code state
  const [downloadingQrId, setDownloadingQrId] = useState<string | null>(null);

  // Create page form
  const [creating, setCreating] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newBio, setNewBio] = useState("");
  const [saving, setSaving] = useState(false);

  // Edit page
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [editSlug, setEditSlug] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // New item form
  const [addingItemToPageId, setAddingItemToPageId] = useState<string | null>(null);
  const [newItemLabel, setNewItemLabel] = useState("");
  const [newItemUrl, setNewItemUrl] = useState("");
  const [newItemSaving, setNewItemSaving] = useState(false);

  // Delete state
  const [deletingPageId, setDeletingPageId] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  // Copy state
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/bio-pages");
      const data = (await res.json()) as { pages?: LinkBioPage[] };
      setPages(data.pages ?? []);
    } catch {
      toast({ title: "Failed to load bio pages", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadExpanded(pageId: string) {
    setLoadingExpanded(true);
    try {
      const res = await fetch(`/api/bio-pages/${pageId}`);
      const data = (await res.json()) as { page?: LinkBioPage };
      setExpandedPage(data.page ?? null);
    } catch {
      toast({ title: "Failed to load page details", variant: "destructive" });
    } finally {
      setLoadingExpanded(false);
    }
  }

  async function toggleExpand(pageId: string) {
    if (expandedId === pageId) {
      setExpandedId(null);
      setExpandedPage(null);
    } else {
      setExpandedId(pageId);
      // Close analytics if open for same page
      if (analyticsPageId === pageId) {
        setAnalyticsPageId(null);
        setAnalyticsData(null);
      }
      await loadExpanded(pageId);
    }
  }

  async function toggleAnalytics(pageId: string) {
    if (analyticsPageId === pageId) {
      setAnalyticsPageId(null);
      setAnalyticsData(null);
      return;
    }
    // Close links section for this page if open
    if (expandedId === pageId) {
      setExpandedId(null);
      setExpandedPage(null);
    }
    setAnalyticsPageId(pageId);
    setLoadingAnalytics(true);
    try {
      const res = await fetch(`/api/bio-pages/${pageId}/analytics`);
      const data = (await res.json()) as AnalyticsData & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load analytics");
      setAnalyticsData(data);
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Failed to load analytics",
        variant: "destructive",
      });
      setAnalyticsPageId(null);
    } finally {
      setLoadingAnalytics(false);
    }
  }

  async function downloadQrCode(page: LinkBioPage) {
    setDownloadingQrId(page.id);
    try {
      const res = await fetch(`/api/bio-pages/${page.id}/qr`);
      if (!res.ok) throw new Error("Failed to generate QR code");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bio-${page.slug}-qr.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "QR code downloaded", variant: "success" });
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Failed to download QR code",
        variant: "destructive",
      });
    } finally {
      setDownloadingQrId(null);
    }
  }

  async function handleCreate() {
    if (!newSlug.trim() || !newTitle.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/bio-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: newSlug.trim().toLowerCase(),
          title: newTitle.trim(),
          bio: newBio.trim() || null,
        }),
      });
      const data = (await res.json()) as { page?: LinkBioPage; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to create page");
      if (data.page) setPages((prev) => [data.page!, ...prev]);
      setNewSlug("");
      setNewTitle("");
      setNewBio("");
      setCreating(false);
      toast({ title: "Bio page created", variant: "success" });
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Failed to create page",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeletePage(pageId: string) {
    setDeletingPageId(pageId);
    try {
      const res = await fetch(`/api/bio-pages/${pageId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to delete page");
      }
      setPages((prev) => prev.filter((p) => p.id !== pageId));
      if (expandedId === pageId) {
        setExpandedId(null);
        setExpandedPage(null);
      }
      if (analyticsPageId === pageId) {
        setAnalyticsPageId(null);
        setAnalyticsData(null);
      }
      toast({ title: "Bio page deleted", variant: "success" });
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Failed to delete page",
        variant: "destructive",
      });
    } finally {
      setDeletingPageId(null);
    }
  }

  async function togglePublished(page: LinkBioPage) {
    try {
      const res = await fetch(`/api/bio-pages/${page.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublished: !page.isPublished }),
      });
      const data = (await res.json()) as { page?: LinkBioPage; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to update page");
      if (data.page) {
        setPages((prev) =>
          prev.map((p) =>
            p.id === page.id ? { ...p, isPublished: data.page!.isPublished } : p
          )
        );
      }
      toast({
        title: data.page?.isPublished ? "Page published" : "Page unpublished",
        variant: "success",
      });
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Failed to update page",
        variant: "destructive",
      });
    }
  }

  function startEditPage(page: LinkBioPage) {
    setEditingPageId(page.id);
    setEditSlug(page.slug);
    setEditTitle(page.title);
    setEditBio(page.bio ?? "");
  }

  async function handleEditPage(pageId: string) {
    setEditSaving(true);
    try {
      const res = await fetch(`/api/bio-pages/${pageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: editSlug.trim().toLowerCase(),
          title: editTitle.trim(),
          bio: editBio.trim() || null,
        }),
      });
      const data = (await res.json()) as { page?: LinkBioPage; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to update page");
      if (data.page) {
        setPages((prev) =>
          prev.map((p) => (p.id === pageId ? { ...p, ...data.page } : p))
        );
      }
      setEditingPageId(null);
      toast({ title: "Bio page updated", variant: "success" });
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Failed to update page",
        variant: "destructive",
      });
    } finally {
      setEditSaving(false);
    }
  }

  async function handleAddItem(pageId: string) {
    if (!newItemLabel.trim() || !newItemUrl.trim()) return;
    setNewItemSaving(true);
    try {
      const res = await fetch(`/api/bio-pages/${pageId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: newItemLabel.trim(),
          url: newItemUrl.trim(),
        }),
      });
      const data = (await res.json()) as { item?: LinkBioItem; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to add link");
      if (data.item) {
        setExpandedPage((prev) =>
          prev
            ? { ...prev, items: [...(prev.items ?? []), data.item!] }
            : prev
        );
        setPages((prev) =>
          prev.map((p) =>
            p.id === pageId
              ? { ...p, _count: { items: (p._count?.items ?? 0) + 1 } }
              : p
          )
        );
      }
      setNewItemLabel("");
      setNewItemUrl("");
      setAddingItemToPageId(null);
      toast({ title: "Link added", variant: "success" });
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Failed to add link",
        variant: "destructive",
      });
    } finally {
      setNewItemSaving(false);
    }
  }

  async function handleDeleteItem(pageId: string, itemId: string) {
    setDeletingItemId(itemId);
    try {
      const res = await fetch(`/api/bio-pages/${pageId}/items/${itemId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to delete link");
      }
      setExpandedPage((prev) =>
        prev
          ? { ...prev, items: (prev.items ?? []).filter((i) => i.id !== itemId) }
          : prev
      );
      setPages((prev) =>
        prev.map((p) =>
          p.id === pageId
            ? {
                ...p,
                _count: { items: Math.max(0, (p._count?.items ?? 0) - 1) },
              }
            : p
        )
      );
      toast({ title: "Link removed", variant: "success" });
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Failed to delete link",
        variant: "destructive",
      });
    } finally {
      setDeletingItemId(null);
    }
  }

  async function toggleItemActive(pageId: string, item: LinkBioItem) {
    try {
      const res = await fetch(`/api/bio-pages/${pageId}/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      const data = (await res.json()) as { item?: LinkBioItem; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to update link");
      if (data.item) {
        setExpandedPage((prev) =>
          prev
            ? {
                ...prev,
                items: (prev.items ?? []).map((i) =>
                  i.id === item.id ? { ...i, isActive: data.item!.isActive } : i
                ),
              }
            : prev
        );
      }
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Failed to update link",
        variant: "destructive",
      });
    }
  }

  function copyBioUrl(slug: string) {
    const url = `${window.location.origin}/bio/${slug}`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopiedSlug(slug);
      setTimeout(() => setCopiedSlug(null), 2000);
    });
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link2 className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Bio Pages</h1>
            <p className="text-sm text-muted-foreground">
              Create a link-in-bio page to share all your important links in one place
            </p>
          </div>
        </div>
        {!creating && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Page
          </Button>
        )}
      </div>

      {/* Create form */}
      {creating && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New Bio Page</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="new-title">Page Title *</Label>
                <Input
                  id="new-title"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. My Links"
                  maxLength={100}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-slug">
                  URL Slug *{" "}
                  <span className="text-muted-foreground font-normal">
                    (postflow.app/bio/…)
                  </span>
                </Label>
                <Input
                  id="new-slug"
                  value={newSlug}
                  onChange={(e) =>
                    setNewSlug(
                      e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")
                    )
                  }
                  placeholder="e.g. myname"
                  maxLength={50}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-bio">Bio (optional)</Label>
              <Textarea
                id="new-bio"
                value={newBio}
                onChange={(e) => setNewBio(e.target.value)}
                placeholder="A short description shown on your bio page…"
                rows={2}
                maxLength={500}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground text-right">
                {newBio.length}/500
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setCreating(false);
                  setNewSlug("");
                  setNewTitle("");
                  setNewBio("");
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void handleCreate()}
                disabled={saving || !newSlug.trim() || !newTitle.trim()}
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Page
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Page list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : pages.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Link2 className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-medium">No bio pages yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create a bio page to share all your links in one place.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {pages.map((page) => (
            <Card key={page.id}>
              {editingPageId === page.id ? (
                <CardContent className="pt-4 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Page Title</Label>
                      <Input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        maxLength={100}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>URL Slug</Label>
                      <Input
                        value={editSlug}
                        onChange={(e) =>
                          setEditSlug(
                            e.target.value
                              .toLowerCase()
                              .replace(/[^a-z0-9-]/g, "")
                          )
                        }
                        maxLength={50}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Bio</Label>
                    <Textarea
                      value={editBio}
                      onChange={(e) => setEditBio(e.target.value)}
                      rows={2}
                      maxLength={500}
                      className="resize-none"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingPageId(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => void handleEditPage(page.id)}
                      disabled={editSaving || !editSlug.trim() || !editTitle.trim()}
                    >
                      {editSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </CardContent>
              ) : (
                <>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold">{page.title}</p>
                          <Badge
                            variant={page.isPublished ? "default" : "secondary"}
                          >
                            {page.isPublished ? "Published" : "Unpublished"}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {page._count?.items ?? 0} links
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          /bio/{page.slug}
                        </p>
                        {page.bio && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {page.bio}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => copyBioUrl(page.slug)}
                          title="Copy link"
                        >
                          {copiedSlug === page.slug ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() =>
                            window.open(`/bio/${page.slug}`, "_blank")
                          }
                          title="Open page"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => void downloadQrCode(page)}
                          disabled={downloadingQrId === page.id}
                          title="Download QR code"
                        >
                          {downloadingQrId === page.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <QrCode className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => void togglePublished(page)}
                          title={page.isPublished ? "Unpublish" : "Publish"}
                        >
                          {page.isPublished ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => startEditPage(page)}
                          title="Edit page"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => void handleDeletePage(page.id)}
                          disabled={deletingPageId === page.id}
                          title="Delete page"
                        >
                          {deletingPageId === page.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Action toggles */}
                    <div className="flex gap-2 mt-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-muted-foreground"
                        onClick={() => void toggleExpand(page.id)}
                      >
                        {expandedId === page.id
                          ? "Hide links ▲"
                          : "Manage links ▼"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`h-7 text-xs ${analyticsPageId === page.id ? "text-primary" : "text-muted-foreground"}`}
                        onClick={() => void toggleAnalytics(page.id)}
                      >
                        <BarChart2 className="mr-1 h-3.5 w-3.5" />
                        {analyticsPageId === page.id
                          ? "Hide analytics ▲"
                          : "Analytics ▼"}
                      </Button>
                    </div>
                  </CardContent>

                  {/* Analytics section */}
                  {analyticsPageId === page.id && (
                    <CardContent className="border-t pt-4 space-y-4">
                      {loadingAnalytics ? (
                        <div className="flex justify-center py-6">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : analyticsData && analyticsData.pageId === page.id ? (
                        <>
                          <div className="flex items-center gap-3">
                            <div className="rounded-lg border px-4 py-2 text-center">
                              <p className="text-2xl font-bold">
                                {analyticsData.totalClicks}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Total Clicks
                              </p>
                            </div>
                            {analyticsData.deviceBreakdown.length > 0 && (
                              <div className="flex gap-2 flex-wrap">
                                {analyticsData.deviceBreakdown.map((d) => (
                                  <Badge key={d.device} variant="outline">
                                    {d.device}: {d.count}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Daily clicks chart */}
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-2">
                              Daily Clicks (last 30 days)
                            </p>
                            <ResponsiveContainer width="100%" height={120}>
                              <LineChart data={analyticsData.dailyClicks}>
                                <XAxis
                                  dataKey="date"
                                  tick={{ fontSize: 10 }}
                                  tickFormatter={(v: string) =>
                                    v.slice(5)
                                  }
                                  interval="preserveStartEnd"
                                />
                                <YAxis
                                  tick={{ fontSize: 10 }}
                                  allowDecimals={false}
                                  width={25}
                                />
                                <Tooltip />
                                <Line
                                  type="monotone"
                                  dataKey="count"
                                  stroke="hsl(var(--primary))"
                                  strokeWidth={2}
                                  dot={false}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>

                          {/* Per-item breakdown */}
                          {analyticsData.items.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-2">
                                Link Performance
                              </p>
                              <div className="space-y-1.5">
                                {analyticsData.items
                                  .sort(
                                    (a, b) => b.clicksTotal - a.clicksTotal
                                  )
                                  .map((item) => (
                                    <div
                                      key={item.itemId}
                                      className="flex items-center gap-3 text-sm"
                                    >
                                      <span className="flex-1 min-w-0 truncate font-medium">
                                        {item.label}
                                      </span>
                                      <span className="flex items-center gap-1 text-muted-foreground shrink-0">
                                        <MousePointerClick className="h-3 w-3" />
                                        {item.clicksTotal}
                                      </span>
                                      <span className="text-xs text-muted-foreground shrink-0">
                                        {item.clicksLast7d} last 7d
                                      </span>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )}

                          {/* QR download button */}
                          <div className="pt-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void downloadQrCode(page)}
                              disabled={downloadingQrId === page.id}
                            >
                              {downloadingQrId === page.id ? (
                                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Download className="mr-2 h-3.5 w-3.5" />
                              )}
                              Download QR Code
                            </Button>
                          </div>
                        </>
                      ) : null}
                    </CardContent>
                  )}

                  {/* Expanded items section */}
                  {expandedId === page.id && (
                    <CardContent className="border-t pt-4 space-y-3">
                      {loadingExpanded ? (
                        <div className="flex justify-center py-4">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        <>
                          {/* Items list */}
                          {(expandedPage?.items ?? []).length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-2">
                              No links yet. Add your first link below.
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {(expandedPage?.items ?? []).map((item) => (
                                <div
                                  key={item.id}
                                  className="flex items-center gap-3 rounded-md border px-3 py-2"
                                >
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium">
                                      {item.label}
                                    </p>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {item.url}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                      <MousePointerClick className="h-3 w-3" />
                                      {item.clicks}
                                    </span>
                                    <button
                                      onClick={() =>
                                        void toggleItemActive(page.id, item)
                                      }
                                      className={`text-xs px-2 py-0.5 rounded-full border font-medium transition-colors ${
                                        item.isActive
                                          ? "bg-primary/10 text-primary border-primary/30"
                                          : "bg-muted text-muted-foreground border-border"
                                      }`}
                                    >
                                      {item.isActive ? "On" : "Off"}
                                    </button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-destructive hover:text-destructive"
                                      onClick={() =>
                                        void handleDeleteItem(page.id, item.id)
                                      }
                                      disabled={deletingItemId === item.id}
                                    >
                                      {deletingItemId === item.id ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-3.5 w-3.5" />
                                      )}
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Add item form */}
                          {addingItemToPageId === page.id ? (
                            <div className="space-y-2 pt-1">
                              <div className="grid gap-2 sm:grid-cols-2">
                                <Input
                                  placeholder="Label (e.g. My Website)"
                                  value={newItemLabel}
                                  onChange={(e) =>
                                    setNewItemLabel(e.target.value)
                                  }
                                  maxLength={100}
                                />
                                <Input
                                  placeholder="URL (https://…)"
                                  value={newItemUrl}
                                  onChange={(e) =>
                                    setNewItemUrl(e.target.value)
                                  }
                                  type="url"
                                  maxLength={2048}
                                />
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => void handleAddItem(page.id)}
                                  disabled={
                                    newItemSaving ||
                                    !newItemLabel.trim() ||
                                    !newItemUrl.trim()
                                  }
                                >
                                  {newItemSaving && (
                                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                                  )}
                                  Add Link
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setAddingItemToPageId(null);
                                    setNewItemLabel("");
                                    setNewItemUrl("");
                                  }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setAddingItemToPageId(page.id)}
                            >
                              <Plus className="mr-2 h-3.5 w-3.5" />
                              Add Link
                            </Button>
                          )}
                        </>
                      )}
                    </CardContent>
                  )}
                </>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
