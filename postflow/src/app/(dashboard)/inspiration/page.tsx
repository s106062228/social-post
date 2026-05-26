"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Plus,
  Trash2,
  ExternalLink,
  FileText,
  Loader2,
  Globe,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Platform =
  | "FACEBOOK"
  | "INSTAGRAM"
  | "THREADS"
  | "LINKEDIN"
  | "PINTEREST"
  | "YOUTUBE"
  | "TIKTOK"
  | "TWITTER"
  | "BLUESKY"
  | "MASTODON"
  | "TELEGRAM"
  | "REDDIT"
  | "NOSTR"
  | "TUMBLR"
  | "WORDPRESS"
  | "MEDIUM"
  | "GHOST"
  | "DEVTO"
  | "GOOGLE_BUSINESS"
  | "HASHNODE"
  | "BEEHIIV";

interface InspirationItem {
  id: string;
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  notes: string | null;
  platform: Platform | null;
  createdAt: string;
  updatedAt: string;
}

const PLATFORM_LABELS: Partial<Record<Platform, string>> = {
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
  HASHNODE: "Hashnode",
  BEEHIIV: "Beehiiv",
};

export default function InspirationPage() {
  const router = useRouter();
  const [items, setItems] = useState<InspirationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newPlatform, setNewPlatform] = useState<Platform | "">("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch("/api/inspiration");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = (await res.json()) as { items: InspirationItem[] };
      setItems(data.items);
    } catch {
      toast.error("Failed to load inspiration items");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  async function handleSave() {
    if (!newUrl.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/inspiration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: newUrl.trim(),
          notes: newNotes.trim() || null,
          platform: newPlatform || null,
        }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "Failed to save");
      }
      toast.success("Inspiration saved");
      setNewUrl("");
      setNewNotes("");
      setNewPlatform("");
      setShowForm(false);
      await fetchItems();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/inspiration/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Removed");
      setItems((prev: InspirationItem[]) => prev.filter((i: InspirationItem) => i.id !== id));
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToPost(id: string, useAi: boolean) {
    setConvertingId(id);
    try {
      const res = await fetch(`/api/inspiration/${id}/to-post`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useAi }),
      });
      if (!res.ok) throw new Error("Failed to create post");
      const data = (await res.json()) as { postId: string };
      toast.success("Draft post created");
      router.push(`/posts?highlight=${data.postId}`);
    } catch {
      toast.error("Failed to create post");
    } finally {
      setConvertingId(null);
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inspiration Board</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Save URLs that inspire you and turn them into posts
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Inspiration
        </Button>
      </div>

      {/* Add form */}
      {showForm && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">URL *</label>
              <Input
                placeholder="https://example.com/interesting-article"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                type="url"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">
                Notes (optional)
              </label>
              <Textarea
                placeholder="What inspired you about this? Key points to include..."
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                rows={3}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">
                Target Platform (optional)
              </label>
              <select
                value={newPlatform}
                onChange={(e) => setNewPlatform(e.target.value as Platform | "")}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">Any platform</option>
                {Object.entries(PLATFORM_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={!newUrl.trim() || saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setNewUrl("");
                  setNewNotes("");
                  setNewPlatform("");
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Items grid */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Globe className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">No inspiration saved yet</p>
          <p className="text-sm">
            Add URLs that inspire you — articles, posts, campaigns
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <Card key={item.id} className="flex flex-col overflow-hidden">
              {/* Preview image */}
              {item.imageUrl ? (
                <div className="relative h-40 bg-muted overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.imageUrl}
                    alt={item.title ?? "Preview"}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
              ) : (
                <div className="h-24 bg-muted/50 flex items-center justify-center">
                  <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                </div>
              )}

              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm leading-tight line-clamp-2">
                      {item.title ?? new URL(item.url).hostname}
                    </p>
                  </div>
                  {item.platform && (
                    <Badge variant="secondary" className="shrink-0 text-xs">
                      {PLATFORM_LABELS[item.platform] ?? item.platform}
                    </Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent className="px-4 pb-2 flex-1 space-y-2">
                {item.description && (
                  <p className="text-xs text-muted-foreground line-clamp-3">
                    {item.description}
                  </p>
                )}
                {item.notes && (
                  <p className="text-xs bg-muted/50 rounded p-2 line-clamp-3 italic">
                    {item.notes}
                  </p>
                )}
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-primary hover:underline truncate"
                >
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  <span className="truncate">{item.url}</span>
                </a>
              </CardContent>

              <CardFooter className="px-4 pb-4 pt-2 flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  disabled={convertingId === item.id}
                  onClick={() => handleToPost(item.id, false)}
                >
                  {convertingId === item.id ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <FileText className="h-3 w-3 mr-1" />
                  )}
                  Create Post
                </Button>
                <Button
                  size="sm"
                  className="flex-1"
                  disabled={convertingId === item.id}
                  onClick={() => handleToPost(item.id, true)}
                >
                  {convertingId === item.id ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3 mr-1" />
                  )}
                  AI Inspire
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={deletingId === item.id}
                  onClick={() => handleDelete(item.id)}
                >
                  {deletingId === item.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
