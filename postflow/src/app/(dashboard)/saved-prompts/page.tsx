"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Sparkles,
  Plus,
  Trash2,
  Loader2,
  Pencil,
  Check,
  X,
  Globe,
  Lock,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

interface SavedPrompt {
  id: string;
  name: string;
  description: string | null;
  prompt: string;
  category: string | null;
  isPublic: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

interface CommunityPrompt {
  id: string;
  name: string;
  description: string | null;
  prompt: string;
  category: string | null;
  usageCount: number;
  createdAt: string;
}

export default function SavedPromptsPage() {
  const [myPrompts, setMyPrompts] = useState<SavedPrompt[]>([]);
  const [communityPrompts, setCommunityPrompts] = useState<CommunityPrompt[]>([]);
  const [loadingMine, setLoadingMine] = useState(true);
  const [loadingCommunity, setLoadingCommunity] = useState(false);
  const [communityLoaded, setCommunityLoaded] = useState(false);

  // Create form state
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newIsPublic, setNewIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editIsPublic, setEditIsPublic] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Adding to library state
  const [addingId, setAddingId] = useState<string | null>(null);

  const loadMine = useCallback(async () => {
    try {
      const res = await fetch("/api/saved-prompts");
      const data = (await res.json()) as { prompts?: SavedPrompt[] };
      setMyPrompts(data.prompts ?? []);
    } catch {
      toast.error("Failed to load prompts");
    } finally {
      setLoadingMine(false);
    }
  }, []);

  const loadCommunity = useCallback(async () => {
    if (communityLoaded) return;
    setLoadingCommunity(true);
    try {
      const res = await fetch("/api/saved-prompts/community");
      const data = (await res.json()) as { prompts?: CommunityPrompt[] };
      setCommunityPrompts(data.prompts ?? []);
      setCommunityLoaded(true);
    } catch {
      toast.error("Failed to load community prompts");
    } finally {
      setLoadingCommunity(false);
    }
  }, [communityLoaded]);

  useEffect(() => {
    void loadMine();
  }, [loadMine]);

  async function handleCreate() {
    if (!newName.trim() || !newPrompt.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/saved-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDescription.trim() || null,
          prompt: newPrompt.trim(),
          category: newCategory.trim() || null,
          isPublic: newIsPublic,
        }),
      });
      const data = (await res.json()) as { savedPrompt?: SavedPrompt; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to create prompt");
      if (data.savedPrompt) setMyPrompts((prev) => [data.savedPrompt!, ...prev]);
      setNewName("");
      setNewDescription("");
      setNewPrompt("");
      setNewCategory("");
      setNewIsPublic(false);
      setCreating(false);
      toast.success("Prompt saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create prompt");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(p: SavedPrompt) {
    setEditingId(p.id);
    setEditName(p.name);
    setEditDescription(p.description ?? "");
    setEditPrompt(p.prompt);
    setEditCategory(p.category ?? "");
    setEditIsPublic(p.isPublic);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditDescription("");
    setEditPrompt("");
    setEditCategory("");
    setEditIsPublic(false);
  }

  async function handleEdit(id: string) {
    setEditSaving(true);
    try {
      const res = await fetch(`/api/saved-prompts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim() || null,
          prompt: editPrompt.trim(),
          category: editCategory.trim() || null,
          isPublic: editIsPublic,
        }),
      });
      const data = (await res.json()) as { savedPrompt?: SavedPrompt; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to update prompt");
      if (data.savedPrompt) {
        setMyPrompts((prev) => prev.map((p) => (p.id === id ? data.savedPrompt! : p)));
      }
      cancelEdit();
      toast.success("Prompt updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update prompt");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/saved-prompts/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to delete prompt");
      }
      setMyPrompts((prev) => prev.filter((p) => p.id !== id));
      toast.success("Prompt deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete prompt");
    } finally {
      setDeletingId(null);
    }
  }

  async function addToLibrary(community: CommunityPrompt) {
    setAddingId(community.id);
    try {
      // Increment the community prompt usage count
      await fetch(`/api/saved-prompts/${community.id}/use`, { method: "POST" });

      // Create a copy in the user's library
      const res = await fetch("/api/saved-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: community.name,
          description: community.description,
          prompt: community.prompt,
          category: community.category,
          isPublic: false,
        }),
      });
      const data = (await res.json()) as { savedPrompt?: SavedPrompt; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to add to library");
      if (data.savedPrompt) setMyPrompts((prev) => [data.savedPrompt!, ...prev]);
      toast.success("Added to My Prompts");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add prompt");
    } finally {
      setAddingId(null);
    }
  }

  const categories = [...new Set(myPrompts.map((p) => p.category).filter(Boolean))] as string[];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Sparkles className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">AI Prompt Library</h1>
            <p className="text-sm text-muted-foreground">
              Save and reuse your best AI prompts. Share them with the community or keep them private.
            </p>
          </div>
        </div>
        {!creating && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Prompt
          </Button>
        )}
      </div>

      <Tabs defaultValue="my-prompts">
        <TabsList>
          <TabsTrigger value="my-prompts">My Prompts</TabsTrigger>
          <TabsTrigger
            value="community"
            onClick={() => void loadCommunity()}
          >
            Community Prompts
          </TabsTrigger>
        </TabsList>

        {/* ── My Prompts tab ─────────────────────────────────────────────── */}
        <TabsContent value="my-prompts" className="space-y-4 mt-4">
          {/* Create form */}
          {creating && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">New Prompt</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="new-name">Name *</Label>
                    <Input
                      id="new-name"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g. Engaging hook generator"
                      maxLength={100}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="new-category">Category (optional)</Label>
                    <Input
                      id="new-category"
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      placeholder="e.g. Hooks, CTAs, Product"
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
                  <Label htmlFor="new-description">Description (optional)</Label>
                  <Input
                    id="new-description"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Brief description of what this prompt does"
                    maxLength={500}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new-prompt">Prompt *</Label>
                  <Textarea
                    id="new-prompt"
                    value={newPrompt}
                    onChange={(e) => setNewPrompt(e.target.value)}
                    placeholder="Write a compelling post about…"
                    rows={5}
                    maxLength={5000}
                    className="resize-y"
                  />
                  <p className="text-xs text-muted-foreground text-right">
                    {newPrompt.length}/5000
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="new-public"
                    checked={newIsPublic}
                    onCheckedChange={setNewIsPublic}
                  />
                  <Label htmlFor="new-public" className="cursor-pointer">
                    Share with community
                  </Label>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setCreating(false);
                      setNewName("");
                      setNewDescription("");
                      setNewPrompt("");
                      setNewCategory("");
                      setNewIsPublic(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => void handleCreate()}
                    disabled={saving || !newName.trim() || !newPrompt.trim()}
                  >
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Prompt
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {loadingMine ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : myPrompts.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Sparkles className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="font-medium">No saved prompts yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Save your best AI prompts for quick reuse in the post composer.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {myPrompts.map((p) =>
                editingId === p.id ? (
                  <Card key={p.id} className="border-primary/50">
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
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Description</Label>
                        <Input
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          maxLength={500}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Prompt</Label>
                        <Textarea
                          value={editPrompt}
                          onChange={(e) => setEditPrompt(e.target.value)}
                          rows={4}
                          maxLength={5000}
                          className="resize-y"
                        />
                        <p className="text-xs text-muted-foreground text-right">
                          {editPrompt.length}/5000
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          id={`edit-public-${p.id}`}
                          checked={editIsPublic}
                          onCheckedChange={setEditIsPublic}
                        />
                        <Label htmlFor={`edit-public-${p.id}`} className="cursor-pointer text-sm">
                          Share with community
                        </Label>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={cancelEdit}>
                          <X className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => void handleEdit(p.id)}
                          disabled={editSaving || !editName.trim() || !editPrompt.trim()}
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
                  <Card key={p.id}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="font-medium truncate">{p.name}</p>
                            {p.isPublic ? (
                              <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Public" />
                            ) : (
                              <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Private" />
                            )}
                          </div>
                          <div className="flex gap-1.5 mt-1 flex-wrap">
                            {p.category && (
                              <Badge variant="secondary" className="text-xs">
                                {p.category}
                              </Badge>
                            )}
                            {p.usageCount > 0 && (
                              <Badge variant="outline" className="text-xs">
                                {p.usageCount} use{p.usageCount !== 1 ? "s" : ""}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => startEdit(p)}
                            title="Edit prompt"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => void handleDelete(p.id)}
                            disabled={deletingId === p.id}
                            title="Delete prompt"
                          >
                            {deletingId === p.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      </div>
                      {p.description && (
                        <p className="text-xs text-muted-foreground mb-1.5">{p.description}</p>
                      )}
                      <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                        {p.prompt}
                      </p>
                    </CardContent>
                  </Card>
                )
              )}
            </div>
          )}
        </TabsContent>

        {/* ── Community Prompts tab ───────────────────────────────────────── */}
        <TabsContent value="community" className="space-y-4 mt-4">
          {loadingCommunity ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : communityPrompts.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Globe className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="font-medium">No community prompts yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Be the first! Create a prompt and mark it as public.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {communityPrompts.map((p) => (
                <Card key={p.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{p.name}</p>
                        <div className="flex gap-1.5 mt-1 flex-wrap">
                          {p.category && (
                            <Badge variant="secondary" className="text-xs">
                              {p.category}
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-xs">
                            {p.usageCount} use{p.usageCount !== 1 ? "s" : ""}
                          </Badge>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => void addToLibrary(p)}
                        disabled={addingId === p.id}
                        title="Add to My Library"
                      >
                        {addingId === p.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                    {p.description && (
                      <p className="text-xs text-muted-foreground mb-1.5">{p.description}</p>
                    )}
                    <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                      {p.prompt}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
