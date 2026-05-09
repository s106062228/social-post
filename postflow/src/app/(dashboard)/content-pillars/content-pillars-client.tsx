"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Layers, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

interface Pillar {
  id: string;
  name: string;
  color: string;
  description: string | null;
  createdAt: Date;
  _count: { posts: number };
}

const PRESET_COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981",
  "#3b82f6", "#ef4444", "#8b5cf6", "#14b8a6",
  "#f97316", "#06b6d4",
];

export function ContentPillarsClient({ initialPillars }: { initialPillars: Pillar[] }) {
  const router = useRouter();
  const [pillars, setPillars] = useState<Pillar[]>(initialPillars);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#6366f1");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/content-pillars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), color: newColor, description: newDescription.trim() || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Error", description: (err as { error?: string }).error ?? "Failed to create pillar", variant: "destructive" });
        return;
      }
      setNewName("");
      setNewColor("#6366f1");
      setNewDescription("");
      router.refresh();
      const created = await res.json() as Pillar & { _count?: { posts: number } };
      setPillars((prev) => [...prev, { ...created, _count: { posts: 0 } }].sort((a, b) => a.name.localeCompare(b.name)));
      toast({ title: "Pillar created" });
    } finally {
      setCreating(false);
    }
  }

  function startEdit(pillar: Pillar) {
    setEditingId(pillar.id);
    setEditName(pillar.name);
    setEditColor(pillar.color);
    setEditDescription(pillar.description ?? "");
  }

  async function handleSaveEdit(id: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/content-pillars/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), color: editColor, description: editDescription.trim() || null }),
      });
      if (!res.ok) {
        toast({ title: "Error", description: "Failed to update pillar", variant: "destructive" });
        return;
      }
      const updated = await res.json() as Pillar;
      setPillars((prev) => prev.map((p) => p.id === id ? { ...p, ...updated } : p));
      setEditingId(null);
      toast({ title: "Pillar updated" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this content pillar? Posts assigned to it will be unassigned.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/content-pillars/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast({ title: "Error", description: "Failed to delete pillar", variant: "destructive" });
        return;
      }
      setPillars((prev) => prev.filter((p) => p.id !== id));
      toast({ title: "Pillar deleted" });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Create form */}
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>New content pillar</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex flex-col gap-3">
            <div className="flex gap-2">
              <Input
                placeholder="Pillar name (e.g. Educational, Promotional)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={100}
                required
                className="flex-1"
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Colour</p>
              <div className="flex gap-1.5 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    className={`h-6 w-6 rounded-full border-2 transition-transform ${newColor === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <input
                  type="color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  className="h-6 w-6 rounded-full cursor-pointer border-0 bg-transparent p-0"
                  title="Custom colour"
                />
              </div>
            </div>
            <Textarea
              placeholder="Description (optional)"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              maxLength={500}
              rows={2}
            />
            <Button type="submit" disabled={creating || !newName.trim()} className="self-start">
              {creating ? "Creating…" : "Create Pillar"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Pillars list */}
      {pillars.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              {pillars.length} pillar{pillars.length !== 1 ? "s" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {pillars.map((pillar) => (
                <div key={pillar.id} className="py-4 first:pt-0 last:pb-0">
                  {editingId === pillar.id ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          maxLength={100}
                          className="flex-1"
                        />
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        {PRESET_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setEditColor(c)}
                            className={`h-5 w-5 rounded-full border-2 transition-transform ${editColor === c ? "border-foreground scale-110" : "border-transparent"}`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                        <input
                          type="color"
                          value={editColor}
                          onChange={(e) => setEditColor(e.target.value)}
                          className="h-5 w-5 rounded-full cursor-pointer border-0 bg-transparent p-0"
                        />
                      </div>
                      <Textarea
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        maxLength={500}
                        rows={2}
                        placeholder="Description (optional)"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleSaveEdit(pillar.id)}
                          disabled={saving || !editName.trim()}
                        >
                          <Check className="h-3.5 w-3.5 mr-1" /> Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingId(null)}
                        >
                          <X className="h-3.5 w-3.5 mr-1" /> Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <span
                        className="mt-0.5 inline-block h-4 w-4 rounded-full flex-shrink-0"
                        style={{ backgroundColor: pillar.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{pillar.name}</p>
                        {pillar.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {pillar.description}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {pillar._count.posts} post{pillar._count.posts !== 1 ? "s" : ""} ·{" "}
                          {new Date(pillar.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => startEdit(pillar)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(pillar.id)}
                          disabled={deletingId === pillar.id}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
