"use client";

import { useState, useEffect, useCallback } from "react";
import { BookMarked, Plus, Trash2, Loader2, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface ContentSnippet {
  id: string;
  name: string;
  content: string;
  category: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function SnippetsPage() {
  const [snippets, setSnippets] = useState<ContentSnippet[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form state
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/snippets");
      const data = (await res.json()) as { snippets?: ContentSnippet[] };
      setSnippets(data.snippets ?? []);
    } catch {
      toast.error("Failed to load snippets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    if (!newName.trim() || !newContent.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/snippets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          content: newContent.trim(),
          category: newCategory.trim() || null,
        }),
      });
      const data = (await res.json()) as { snippet?: ContentSnippet; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to create snippet");
      if (data.snippet) setSnippets((prev) => [data.snippet!, ...prev]);
      setNewName("");
      setNewContent("");
      setNewCategory("");
      setCreating(false);
      toast.success("Snippet created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create snippet");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(snippet: ContentSnippet) {
    setEditingId(snippet.id);
    setEditName(snippet.name);
    setEditContent(snippet.content);
    setEditCategory(snippet.category ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditContent("");
    setEditCategory("");
  }

  async function handleEdit(id: string) {
    setEditSaving(true);
    try {
      const res = await fetch(`/api/snippets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          content: editContent.trim(),
          category: editCategory.trim() || null,
        }),
      });
      const data = (await res.json()) as { snippet?: ContentSnippet; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to update snippet");
      if (data.snippet) {
        setSnippets((prev) =>
          prev.map((s) => (s.id === id ? data.snippet! : s))
        );
      }
      cancelEdit();
      toast.success("Snippet updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update snippet");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/snippets/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to delete snippet");
      }
      setSnippets((prev) => prev.filter((s) => s.id !== id));
      toast.success("Snippet deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete snippet");
    } finally {
      setDeletingId(null);
    }
  }

  const categories = [...new Set(snippets.map((s) => s.category).filter(Boolean))] as string[];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookMarked className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Content Snippets</h1>
            <p className="text-sm text-muted-foreground">
              Reusable text blocks — signatures, CTAs, disclaimers — insertable into any post
            </p>
          </div>
        </div>
        {!creating && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Snippet
          </Button>
        )}
      </div>

      {/* Create form */}
      {creating && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New Snippet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="new-name">Name *</Label>
                <Input
                  id="new-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Call-to-action footer"
                  maxLength={100}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-category">Category (optional)</Label>
                <Input
                  id="new-category"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="e.g. CTA, Signature, Hashtags"
                  maxLength={50}
                  list="category-suggestions"
                />
                {categories.length > 0 && (
                  <datalist id="category-suggestions">
                    {categories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-content">Content *</Label>
              <Textarea
                id="new-content"
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Enter the snippet text…"
                rows={4}
                maxLength={5000}
                className="resize-y"
              />
              <p className="text-xs text-muted-foreground text-right">
                {newContent.length}/5000
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setCreating(false);
                  setNewName("");
                  setNewContent("");
                  setNewCategory("");
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void handleCreate()}
                disabled={saving || !newName.trim() || !newContent.trim()}
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Snippet
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : snippets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <BookMarked className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-medium">No snippets yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create snippets to quickly insert reusable text into your posts.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {snippets.map((snippet) =>
            editingId === snippet.id ? (
              <Card key={snippet.id} className="border-primary/50">
                <CardContent className="space-y-3 pt-4">
                  <div className="space-y-1">
                    <Label>Name</Label>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      maxLength={100}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Category</Label>
                    <Input
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      maxLength={50}
                      list="category-suggestions-edit"
                    />
                    {categories.length > 0 && (
                      <datalist id="category-suggestions-edit">
                        {categories.map((c) => (
                          <option key={c} value={c} />
                        ))}
                      </datalist>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label>Content</Label>
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={4}
                      maxLength={5000}
                      className="resize-y"
                    />
                    <p className="text-xs text-muted-foreground text-right">
                      {editContent.length}/5000
                    </p>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={cancelEdit}>
                      <X className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => void handleEdit(snippet.id)}
                      disabled={editSaving || !editName.trim() || !editContent.trim()}
                    >
                      {editSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card key={snippet.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{snippet.name}</p>
                      {snippet.category && (
                        <Badge variant="secondary" className="mt-1 text-xs">
                          {snippet.category}
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => startEdit(snippet)}
                        title="Edit snippet"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => void handleDelete(snippet.id)}
                        disabled={deletingId === snippet.id}
                        title="Delete snippet"
                      >
                        {deletingId === snippet.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                    {snippet.content}
                  </p>
                </CardContent>
              </Card>
            )
          )}
        </div>
      )}
    </div>
  );
}
