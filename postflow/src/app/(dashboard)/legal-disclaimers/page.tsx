"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, FileText, Eye, EyeOff, Pencil } from "lucide-react";
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

interface LegalDisclaimer {
  id: string;
  name: string;
  content: string;
  platforms: string[];
  position: string;
  autoAppend: boolean;
  isActive: boolean;
}

const defaultForm = {
  name: "",
  content: "",
  platforms: [] as string[],
  position: "append",
  autoAppend: false,
  isActive: true,
};

export default function LegalDisclaimersPage() {
  const [disclaimers, setDisclaimers] = useState<LegalDisclaimer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...defaultForm });
  const [saving, setSaving] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState("");
  const [previewResult, setPreviewResult] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const fetchDisclaimers = useCallback(async () => {
    try {
      const res = await fetch("/api/legal-disclaimers");
      if (res.ok) {
        const data = (await res.json()) as { disclaimers: LegalDisclaimer[] };
        setDisclaimers(data.disclaimers);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDisclaimers();
  }, [fetchDisclaimers]);

  function togglePlatform(platform: string) {
    setForm((f) => ({
      ...f,
      platforms: f.platforms.includes(platform)
        ? f.platforms.filter((p) => p !== platform)
        : [...f.platforms, platform],
    }));
  }

  function startEdit(disclaimer: LegalDisclaimer) {
    setEditingId(disclaimer.id);
    setForm({
      name: disclaimer.name,
      content: disclaimer.content,
      platforms: [...disclaimer.platforms],
      position: disclaimer.position,
      autoAppend: disclaimer.autoAppend,
      isActive: disclaimer.isActive,
    });
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm({ ...defaultForm });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const url = editingId
        ? `/api/legal-disclaimers/${editingId}`
        : "/api/legal-disclaimers";
      const method = editingId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        toast.error(data.error ?? "Failed to save disclaimer");
        return;
      }

      const data = (await res.json()) as { disclaimer: LegalDisclaimer };
      if (editingId) {
        setDisclaimers((prev) =>
          prev.map((d) => (d.id === editingId ? data.disclaimer : d))
        );
        toast.success("Disclaimer updated");
      } else {
        setDisclaimers((prev) => [...prev, data.disclaimer]);
        toast.success("Disclaimer created");
      }
      cancelForm();
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(id: string, isActive: boolean) {
    const res = await fetch(`/api/legal-disclaimers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    if (res.ok) {
      setDisclaimers((prev) =>
        prev.map((d) => (d.id === id ? { ...d, isActive } : d))
      );
    } else {
      toast.error("Failed to update disclaimer");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this disclaimer?")) return;
    const res = await fetch(`/api/legal-disclaimers/${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setDisclaimers((prev) => prev.filter((d) => d.id !== id));
      toast.success("Disclaimer deleted");
    } else {
      toast.error("Failed to delete disclaimer");
    }
  }

  async function handlePreview(id: string) {
    if (!previewContent.trim()) {
      toast.error("Enter sample content to preview");
      return;
    }
    setPreviewId(id);
    setPreviewing(true);
    try {
      const res = await fetch("/api/legal-disclaimers/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: previewContent, disclaimerId: id }),
      });
      if (res.ok) {
        const data = (await res.json()) as { preview: string };
        setPreviewResult(data.preview);
      } else {
        toast.error("Failed to generate preview");
      }
    } finally {
      setPreviewing(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Legal Disclaimers</h1>
        <p className="text-muted-foreground mt-1">
          Manage compliance footers and legal text that can be automatically
          appended or prepended to your posts.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex justify-end">
          <Button onClick={() => { setEditingId(null); setForm({ ...defaultForm }); setShowForm((v) => !v); }} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Add Disclaimer
          </Button>
        </div>

        {showForm && (
          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="rounded-lg border p-4 space-y-4 bg-card"
          >
            <h2 className="font-semibold">
              {editingId ? "Edit Disclaimer" : "New Disclaimer"}
            </h2>

            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Standard legal footer"
                required
              />
            </div>

            <div className="space-y-1">
              <Label>Disclaimer Content</Label>
              <Textarea
                value={form.content}
                onChange={(e) =>
                  setForm((f) => ({ ...f, content: e.target.value }))
                }
                placeholder="Enter your legal disclaimer text…"
                rows={4}
                required
              />
              <p className="text-xs text-muted-foreground">
                {form.content.length}/5000 characters
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Position</Label>
                <select
                  value={form.position}
                  onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                >
                  <option value="append">Append (after content)</option>
                  <option value="prepend">Prepend (before content)</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Platforms (leave empty for all)</Label>
              <div className="flex flex-wrap gap-2">
                {ALL_PLATFORMS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePlatform(p)}
                    className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                      form.platforms.includes(p)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border hover:border-primary"
                    }`}
                  >
                    {PLATFORM_LABELS[p] ?? p}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="autoAppend"
                  checked={form.autoAppend}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, autoAppend: v }))
                  }
                />
                <Label htmlFor="autoAppend">Auto-append to new posts</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="isActive"
                  checked={form.isActive}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, isActive: v }))
                  }
                />
                <Label htmlFor="isActive">Active</Label>
              </div>
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : editingId ? "Update" : "Create Disclaimer"}
              </Button>
              <Button type="button" variant="outline" onClick={cancelForm}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {!loading && disclaimers.length === 0 && !showForm && (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="font-medium">No legal disclaimers yet</p>
            <p className="text-sm">
              Add disclaimers to automatically include legal text in your posts.
            </p>
          </div>
        )}

        {disclaimers.length > 0 && (
          <div className="space-y-4">
            {/* Preview section */}
            <div className="rounded-lg border p-4 bg-muted/30 space-y-2">
              <Label className="text-sm font-medium">Preview Disclaimer</Label>
              <Textarea
                value={previewContent}
                onChange={(e) => {
                  setPreviewContent(e.target.value);
                  setPreviewResult(null);
                }}
                placeholder="Enter sample post content to preview how the disclaimer will appear…"
                rows={3}
              />
              {previewResult !== null && (
                <div className="rounded border bg-background p-3 text-sm whitespace-pre-wrap">
                  {previewResult}
                </div>
              )}
            </div>

            <div className="space-y-2">
              {disclaimers.map((disclaimer) => (
                <div
                  key={disclaimer.id}
                  className={`rounded-lg border p-4 space-y-2 ${
                    !disclaimer.isActive ? "opacity-50" : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {disclaimer.name}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {disclaimer.position === "prepend"
                            ? "Prepend"
                            : "Append"}
                        </Badge>
                        {disclaimer.autoAppend && (
                          <Badge variant="secondary" className="text-xs">
                            Auto-append
                          </Badge>
                        )}
                        {disclaimer.platforms.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            {disclaimer.platforms.map((p) => (
                              <Badge
                                key={p}
                                variant="outline"
                                className="text-xs"
                              >
                                {PLATFORM_LABELS[p] ?? p}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {disclaimer.content}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Preview"
                        disabled={previewing && previewId === disclaimer.id}
                        onClick={() => void handlePreview(disclaimer.id)}
                      >
                        {previewing && previewId === disclaimer.id ? (
                          <Eye className="h-4 w-4 animate-pulse" />
                        ) : (
                          <EyeOff className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Edit"
                        onClick={() => startEdit(disclaimer)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Switch
                        checked={disclaimer.isActive}
                        onCheckedChange={(v) =>
                          void handleToggle(disclaimer.id, v)
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => void handleDelete(disclaimer.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
