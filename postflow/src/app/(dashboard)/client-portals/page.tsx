"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Trash2, Copy, ExternalLink, Eye, Globe, EyeOff } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ClientPortal {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  accentColor: string;
  showCalendar: boolean;
  showAnalytics: boolean;
  showPosts: boolean;
  isPublished: boolean;
  expiresAt: string | null;
  views: number;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_ACCENT = "#6366f1";

export default function ClientPortalsPage() {
  const [portals, setPortals] = useState<ClientPortal[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  // Create form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [slug, setSlug] = useState("");
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT);
  const [showCalendar, setShowCalendar] = useState(true);
  const [showAnalytics, setShowAnalytics] = useState(true);
  const [showPosts, setShowPosts] = useState(true);
  const [isPublished, setIsPublished] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/client-portals");
      if (res.ok) {
        const data = await res.json();
        setPortals(data.portals);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/client-portals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description || null,
          slug: slug || undefined,
          accentColor,
          showCalendar,
          showAnalytics,
          showPosts,
          isPublished,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error ?? "Failed to create portal");
        return;
      }
      const data = await res.json();
      setPortals((prev) => [data.portal, ...prev]);
      setTitle("");
      setDescription("");
      setSlug("");
      setAccentColor(DEFAULT_ACCENT);
      setShowCalendar(true);
      setShowAnalytics(true);
      setShowPosts(true);
      setIsPublished(false);
      setOpen(false);
      toast.success("Client portal created");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this client portal?")) return;
    const res = await fetch(`/api/client-portals/${id}`, { method: "DELETE" });
    if (res.ok) {
      setPortals((prev) => prev.filter((p) => p.id !== id));
      toast.success("Portal deleted");
    } else {
      toast.error("Failed to delete portal");
    }
  };

  const handleTogglePublished = async (portal: ClientPortal) => {
    const res = await fetch(`/api/client-portals/${portal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublished: !portal.isPublished }),
    });
    if (res.ok) {
      const data = await res.json();
      setPortals((prev) => prev.map((p) => (p.id === portal.id ? { ...p, isPublished: data.portal.isPublished } : p)));
      toast.success(data.portal.isPublished ? "Portal published" : "Portal unpublished");
    } else {
      toast.error("Failed to update portal");
    }
  };

  const copyUrl = (portal: ClientPortal) => {
    const url = `${window.location.origin}/portal/${portal.slug}`;
    navigator.clipboard.writeText(url).then(() => toast.success("URL copied to clipboard"));
  };

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-gray-500">Loading client portals...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Client Portals</h1>
          <p className="text-sm text-gray-500 mt-1">
            Share branded reporting dashboards with clients — no login required
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Portal
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Client Portal</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <Label htmlFor="portal-title">Title *</Label>
                <Input
                  id="portal-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Acme Corp Social Media Report"
                />
              </div>
              <div>
                <Label htmlFor="portal-description">Description</Label>
                <Input
                  id="portal-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Monthly social media performance overview"
                />
              </div>
              <div>
                <Label htmlFor="portal-slug">
                  Custom URL slug{" "}
                  <span className="text-gray-400 text-xs">(optional, auto-generated if blank)</span>
                </Label>
                <Input
                  id="portal-slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder="acme-corp"
                />
                {slug && (
                  <p className="text-xs text-gray-500 mt-1">
                    URL: /portal/{slug}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="portal-color">Accent Color</Label>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="color"
                    id="portal-color"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="w-10 h-10 rounded cursor-pointer border border-gray-200"
                  />
                  <span className="text-sm text-gray-600">{accentColor}</span>
                </div>
              </div>
              <div className="space-y-3">
                <Label>Sections to show</Label>
                {[
                  { key: "calendar", label: "Upcoming Schedule", value: showCalendar, setter: setShowCalendar },
                  { key: "analytics", label: "Analytics Overview", value: showAnalytics, setter: setShowAnalytics },
                  { key: "posts", label: "Recent Posts", value: showPosts, setter: setShowPosts },
                ].map(({ key, label, value, setter }) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{label}</span>
                    <Switch checked={value} onCheckedChange={setter} />
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="portal-published">Publish immediately</Label>
                <Switch id="portal-published" checked={isPublished} onCheckedChange={setIsPublished} />
              </div>
              <Button onClick={handleCreate} disabled={creating || !title.trim()} className="w-full">
                {creating ? "Creating..." : "Create Portal"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {portals.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Globe className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">No client portals yet</p>
            <p className="text-sm text-gray-400 mt-1">
              Create a portal to share your content schedule and analytics with clients
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {portals.map((portal) => (
            <Card key={portal.id} className="overflow-hidden">
              <div
                className="h-2"
                style={{ backgroundColor: portal.accentColor }}
              />
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base truncate">{portal.title}</CardTitle>
                    {portal.description && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{portal.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        portal.isPublished
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {portal.isPublished ? "Live" : "Draft"}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5" />
                    {portal.views} views
                  </span>
                  <span>/portal/{portal.slug}</span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {portal.showCalendar && (
                    <span className="text-xs bg-blue-50 text-blue-700 rounded px-2 py-0.5">Schedule</span>
                  )}
                  {portal.showAnalytics && (
                    <span className="text-xs bg-purple-50 text-purple-700 rounded px-2 py-0.5">Analytics</span>
                  )}
                  {portal.showPosts && (
                    <span className="text-xs bg-green-50 text-green-700 rounded px-2 py-0.5">Posts</span>
                  )}
                </div>

                <p className="text-xs text-gray-400">
                  Created {formatDistanceToNow(new Date(portal.createdAt), { addSuffix: true })}
                </p>

                <div className="flex items-center gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyUrl(portal)}
                    className="flex-1"
                  >
                    <Copy className="w-3.5 h-3.5 mr-1.5" />
                    Copy URL
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                  >
                    <a href={`/portal/${portal.slug}`} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTogglePublished(portal)}
                    title={portal.isPublished ? "Unpublish" : "Publish"}
                  >
                    {portal.isPublished ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Globe className="w-3.5 h-3.5" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(portal.id)}
                    className="text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
