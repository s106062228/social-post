"use client";

import { useState, useCallback } from "react";
import {
  Link2,
  Plus,
  Trash2,
  Loader2,
  Copy,
  ExternalLink,
  BarChart2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface ShortLink {
  id: string;
  originalUrl: string;
  slug: string;
  title: string | null;
  clicks: number;
  expiresAt: string | null;
  createdAt: string;
}

interface Props {
  initialLinks: ShortLink[];
}

function getShortUrl(slug: string): string {
  return `${window.location.origin}/s/${slug}`;
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

export function ShortLinksClient({ initialLinks }: Props) {
  const [links, setLinks] = useState<ShortLink[]>(initialLinks);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Create form state
  const [originalUrl, setOriginalUrl] = useState("");
  const [customSlug, setCustomSlug] = useState("");
  const [title, setTitle] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [showForm, setShowForm] = useState(false);

  const handleCreate = useCallback(async () => {
    if (!originalUrl.trim()) return;
    setCreating(true);
    try {
      const body: Record<string, string> = { originalUrl: originalUrl.trim() };
      if (customSlug.trim()) body.slug = customSlug.trim();
      if (title.trim()) body.title = title.trim();
      if (expiresAt) body.expiresAt = new Date(expiresAt).toISOString();

      const res = await fetch("/api/short-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { link?: ShortLink; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Failed to create short link");
        return;
      }
      setLinks((prev) => [data.link!, ...prev]);
      setOriginalUrl("");
      setCustomSlug("");
      setTitle("");
      setExpiresAt("");
      setShowForm(false);
      toast.success("Short link created");
    } finally {
      setCreating(false);
    }
  }, [originalUrl, customSlug, title, expiresAt]);

  const handleDelete = useCallback(async (id: string) => {
    setDeleting(id);
    try {
      const res = await fetch(`/api/short-links/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Failed to delete short link");
        return;
      }
      setLinks((prev) => prev.filter((l) => l.id !== id));
      toast.success("Short link deleted");
    } finally {
      setDeleting(null);
    }
  }, []);

  const handleCopy = useCallback((slug: string) => {
    void navigator.clipboard.writeText(getShortUrl(slug));
    toast.success("Copied to clipboard");
  }, []);

  return (
    <div className="space-y-4">
      {/* Create form toggle */}
      <div className="flex justify-between items-center">
        <span className="text-sm text-muted-foreground">{links.length} link{links.length !== 1 ? "s" : ""}</span>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="h-4 w-4 mr-1" />
          New Short Link
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
          <h3 className="font-medium text-sm">Create Short Link</h3>
          <div className="space-y-2">
            <Label htmlFor="originalUrl">Destination URL *</Label>
            <Input
              id="originalUrl"
              type="url"
              placeholder="https://example.com/very-long-url"
              value={originalUrl}
              onChange={(e) => setOriginalUrl(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="customSlug">Custom slug (optional)</Label>
              <Input
                id="customSlug"
                placeholder="my-link"
                value={customSlug}
                onChange={(e) => setCustomSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ""))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Title (optional)</Label>
              <Input
                id="title"
                placeholder="Link title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="expiresAt">Expires at (optional)</Label>
            <Input
              id="expiresAt"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={creating || !originalUrl.trim()}
            >
              {creating ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4 mr-1" />
              )}
              Create
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Links table */}
      {links.length === 0 ? (
        <p className="text-center text-muted-foreground py-8 text-sm">
          No short links yet. Create one to get started.
        </p>
      ) : (
        <div className="space-y-2">
          {links.map((link) => {
            const expired = isExpired(link.expiresAt);
            return (
              <div
                key={link.id}
                className="flex items-start gap-3 p-3 border rounded-lg bg-card"
              >
                <div className="flex-1 min-w-0 space-y-1">
                  {link.title && (
                    <p className="font-medium text-sm truncate">{link.title}</p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                      /s/{link.slug}
                    </code>
                    {expired && (
                      <Badge variant="destructive" className="text-xs">Expired</Badge>
                    )}
                    {link.expiresAt && !expired && (
                      <Badge variant="secondary" className="text-xs">
                        Expires {formatDistanceToNow(new Date(link.expiresAt), { addSuffix: true })}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate max-w-sm">
                    {link.originalUrl}
                  </p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <BarChart2 className="h-3 w-3" />
                    <span>{link.clicks} click{link.clicks !== 1 ? "s" : ""}</span>
                    <span className="mx-1">·</span>
                    <span>{formatDistanceToNow(new Date(link.createdAt), { addSuffix: true })}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    title="Copy short URL"
                    onClick={() => handleCopy(link.slug)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    title="Open original URL"
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
            );
          })}
        </div>
      )}
    </div>
  );
}
