"use client";

import { useState, useEffect, useCallback } from "react";
import { MessageCircleReply, Plus, Trash2, Loader2, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface ResponseTemplate {
  id: string;
  name: string;
  content: string;
  category: string | null;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export default function ResponseTemplatesPage() {
  const [templates, setTemplates] = useState<ResponseTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/response-templates");
      const data = (await res.json()) as { templates?: ResponseTemplate[] };
      setTemplates(data.templates ?? []);
    } catch {
      toast.error("Failed to load response templates");
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
      const res = await fetch("/api/response-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          content: newContent.trim(),
          category: newCategory.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { template?: ResponseTemplate; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to create template");
      if (data.template) setTemplates((prev) => [data.template!, ...prev]);
      setNewName("");
      setNewContent("");
      setNewCategory("");
      setCreating(false);
      toast.success("Template created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create template");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(t: ResponseTemplate) {
    setEditingId(t.id);
    setEditName(t.name);
    setEditContent(t.content);
    setEditCategory(t.category ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function handleEdit(id: string) {
    setEditSaving(true);
    try {
      const res = await fetch(`/api/response-templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          content: editContent.trim(),
          category: editCategory.trim() || null,
        }),
      });
      const data = (await res.json()) as { template?: ResponseTemplate; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to update template");
      if (data.template) {
        setTemplates((prev) => prev.map((t) => (t.id === id ? data.template! : t)));
      }
      cancelEdit();
      toast.success("Template updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update template");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/response-templates/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to delete template");
      }
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      toast.success("Template deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete template");
    } finally {
      setDeletingId(null);
    }
  }

  const categories = [...new Set(templates.map((t) => t.category).filter(Boolean))] as string[];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MessageCircleReply className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Response Templates</h1>
            <p className="text-sm text-muted-foreground">
              Reusable reply templates for quickly responding to comments
            </p>
          </div>
        </div>
        {!creating && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Template
          </Button>
        )}
      </div>

      {creating && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New Response Template</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="new-name">Name *</Label>
                <Input
                  id="new-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Thank you reply"
                  maxLength={100}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-category">Category (optional)</Label>
                <Input
                  id="new-category"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="e.g. Thanks, Support, Promotion"
                  maxLength={50}
                  list="cat-suggestions"
                />
                {categories.length > 0 && (
                  <datalist id="cat-suggestions">
                    {categories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-content">Reply Content *</Label>
              <Textarea
                id="new-content"
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Enter the reply text…"
                rows={3}
                maxLength={2000}
                className="resize-y"
              />
              <p className="text-xs text-muted-foreground text-right">{newContent.length}/2000</p>
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
                Create Template
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <MessageCircleReply className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-medium">No response templates yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create templates to quickly reply to comments in your social inbox.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) =>
            editingId === t.id ? (
              <Card key={t.id} className="border-primary/50">
                <CardContent className="space-y-3 pt-4">
                  <div className="space-y-1">
                    <Label>Name</Label>
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={100} />
                  </div>
                  <div className="space-y-1">
                    <Label>Category</Label>
                    <Input value={editCategory} onChange={(e) => setEditCategory(e.target.value)} maxLength={50} />
                  </div>
                  <div className="space-y-1">
                    <Label>Content</Label>
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={3}
                      maxLength={2000}
                      className="resize-y"
                    />
                    <p className="text-xs text-muted-foreground text-right">{editContent.length}/2000</p>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={cancelEdit}>
                      <X className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => void handleEdit(t.id)}
                      disabled={editSaving || !editName.trim() || !editContent.trim()}
                    >
                      {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card key={t.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{t.name}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {t.category && (
                          <Badge variant="secondary" className="text-xs">
                            {t.category}
                          </Badge>
                        )}
                        {t.usageCount > 0 && (
                          <span className="text-xs text-muted-foreground">
                            Used {t.usageCount}×
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => startEdit(t)}
                        title="Edit template"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => void handleDelete(t.id)}
                        disabled={deletingId === t.id}
                        title="Delete template"
                      >
                        {deletingId === t.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                    {t.content}
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
