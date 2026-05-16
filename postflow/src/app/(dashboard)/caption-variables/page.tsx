"use client";

import { useState, useEffect, useCallback } from "react";
import { Braces, Plus, Trash2, Loader2, Pencil, Check, X, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface CaptionVariable {
  id: string;
  key: string;
  value: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function CaptionVariablesPage() {
  const [variables, setVariables] = useState<CaptionVariable[]>([]);
  const [loading, setLoading] = useState(true);

  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editKey, setEditKey] = useState("");
  const [editValue, setEditValue] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/caption-variables");
      const data = (await res.json()) as { variables?: CaptionVariable[] };
      setVariables(data.variables ?? []);
    } catch {
      toast.error("Failed to load variables");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    if (!newKey.trim() || !newValue.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/caption-variables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: newKey.trim(),
          value: newValue.trim(),
          description: newDescription.trim() || null,
        }),
      });
      const data = (await res.json()) as { variable?: CaptionVariable; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to create variable");
      if (data.variable) setVariables((prev) => [...prev, data.variable!].sort((a, b) => a.key.localeCompare(b.key)));
      setNewKey("");
      setNewValue("");
      setNewDescription("");
      setCreating(false);
      toast.success("Variable created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create variable");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(v: CaptionVariable) {
    setEditingId(v.id);
    setEditKey(v.key);
    setEditValue(v.value);
    setEditDescription(v.description ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditKey("");
    setEditValue("");
    setEditDescription("");
  }

  async function handleEdit(id: string) {
    setEditSaving(true);
    try {
      const res = await fetch(`/api/caption-variables/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: editKey.trim(),
          value: editValue.trim(),
          description: editDescription.trim() || null,
        }),
      });
      const data = (await res.json()) as { variable?: CaptionVariable; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to update variable");
      if (data.variable) {
        setVariables((prev) =>
          prev.map((v) => (v.id === id ? data.variable! : v)).sort((a, b) => a.key.localeCompare(b.key))
        );
      }
      cancelEdit();
      toast.success("Variable updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update variable");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/caption-variables/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to delete variable");
      }
      setVariables((prev) => prev.filter((v) => v.id !== id));
      toast.success("Variable deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete variable");
    } finally {
      setDeletingId(null);
    }
  }

  function copyPlaceholder(key: string) {
    void navigator.clipboard.writeText(`{{${key}}}`);
    toast.success(`Copied {{${key}}} to clipboard`);
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Braces className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Caption Variables</h1>
            <p className="text-sm text-muted-foreground">
              Define merge-tag variables like{" "}
              <code className="rounded bg-muted px-1 font-mono text-xs">{"{{brand_name}}"}</code>{" "}
              that are automatically substituted when posts are published
            </p>
          </div>
        </div>
        {!creating && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Variable
          </Button>
        )}
      </div>

      {/* Create form */}
      {creating && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New Variable</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="new-key">Key *</Label>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-muted-foreground font-mono">{"{{"}</span>
                  <Input
                    id="new-key"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
                    placeholder="brand_name"
                    maxLength={50}
                    className="font-mono"
                  />
                  <span className="text-sm text-muted-foreground font-mono">{"}}"}</span>
                </div>
                <p className="text-xs text-muted-foreground">Letters, numbers, underscores only</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-value">Value *</Label>
                <Input
                  id="new-value"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="e.g. PostFlow"
                  maxLength={1000}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-description">Description (optional)</Label>
              <Input
                id="new-description"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="What this variable is used for"
                maxLength={200}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setCreating(false);
                  setNewKey("");
                  setNewValue("");
                  setNewDescription("");
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void handleCreate()}
                disabled={saving || !newKey.trim() || !newValue.trim()}
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Variable
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
      ) : variables.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Braces className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-medium">No variables yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create variables to use dynamic placeholders in your post content.
              <br />
              Example: <code className="rounded bg-muted px-1 font-mono text-xs">{"{{brand_name}}"}</code> →{" "}
              <span className="font-medium">PostFlow</span>
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {variables.map((variable) =>
            editingId === variable.id ? (
              <Card key={variable.id} className="border-primary/50">
                <CardContent className="space-y-3 pt-4">
                  <div className="space-y-1">
                    <Label>Key</Label>
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-muted-foreground font-mono">{"{{"}</span>
                      <Input
                        value={editKey}
                        onChange={(e) => setEditKey(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
                        maxLength={50}
                        className="font-mono"
                      />
                      <span className="text-sm text-muted-foreground font-mono">{"}}"}</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Value</Label>
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      maxLength={1000}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Description</Label>
                    <Input
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      maxLength={200}
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={cancelEdit}>
                      <X className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => void handleEdit(variable.id)}
                      disabled={editSaving || !editKey.trim() || !editValue.trim()}
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
              <Card key={variable.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm font-medium truncate">
                          {`{{${variable.key}}}`}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0"
                          onClick={() => copyPlaceholder(variable.key)}
                          title="Copy placeholder"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => startEdit(variable)}
                        title="Edit variable"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => void handleDelete(variable.id)}
                        disabled={deletingId === variable.id}
                        title="Delete variable"
                      >
                        {deletingId === variable.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm font-medium text-foreground mt-1 truncate">
                    → {variable.value}
                  </p>
                  {variable.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {variable.description}
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          )}
        </div>
      )}

      {variables.length > 0 && (
        <Card className="bg-muted/50">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">How to use:</span> In your post content,
              write{" "}
              <code className="rounded bg-background px-1 font-mono text-xs">{"{{variable_key}}"}</code>{" "}
              and it will be automatically replaced with the variable&apos;s value when the post is published.
              You can also use the &ldquo;Insert Variable&rdquo; button in the post composer.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
