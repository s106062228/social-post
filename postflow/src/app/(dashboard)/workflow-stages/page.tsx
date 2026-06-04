"use client";

import { useState, useEffect, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { ChevronUp, ChevronDown, Pencil, Trash2, Plus, Check, X } from "lucide-react";

const PRESET_COLORS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#64748b", // slate
  "#78716c", // stone
];

type WorkflowStage = {
  id: string;
  name: string;
  color: string;
  order: number;
  _count: { posts: number };
};

export default function WorkflowStagesPage() {
  const [stages, setStages] = useState<WorkflowStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [isPending, startTransition] = useTransition();

  async function fetchStages() {
    setLoading(true);
    try {
      const res = await fetch("/api/workflow-stages");
      if (!res.ok) throw new Error("Failed to load stages");
      const data = (await res.json()) as { stages: WorkflowStage[] };
      setStages(data.stages);
    } catch {
      toast({ title: "Failed to load workflow stages", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchStages();
  }, []);

  function createStage() {
    if (!newName.trim()) {
      toast({ title: "Stage name is required", variant: "destructive" });
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/workflow-stages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newName.trim(), color: newColor }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Create failed");
        }
        toast({ title: "Stage created", variant: "success" });
        setNewName("");
        setNewColor(PRESET_COLORS[0]);
        setCreating(false);
        await fetchStages();
      } catch (err) {
        toast({
          title: "Failed to create stage",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
      }
    });
  }

  function startEdit(stage: WorkflowStage) {
    setEditingId(stage.id);
    setEditName(stage.name);
    setEditColor(stage.color);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditColor("");
  }

  function updateStage(id: string) {
    if (!editName.trim()) {
      toast({ title: "Stage name is required", variant: "destructive" });
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/workflow-stages/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: editName.trim(), color: editColor }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Update failed");
        }
        toast({ title: "Stage updated", variant: "success" });
        cancelEdit();
        await fetchStages();
      } catch (err) {
        toast({
          title: "Failed to update stage",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
      }
    });
  }

  function deleteStage(id: string, postCount: number) {
    const message =
      postCount > 0
        ? `This stage has ${postCount} post${postCount !== 1 ? "s" : ""}. Posts will be unassigned. Delete anyway?`
        : "Delete this workflow stage?";
    if (!confirm(message)) return;

    startTransition(async () => {
      try {
        const res = await fetch(`/api/workflow-stages/${id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Delete failed");
        }
        toast({ title: "Stage deleted", variant: "success" });
        await fetchStages();
      } catch (err) {
        toast({
          title: "Failed to delete stage",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
      }
    });
  }

  async function moveStage(id: string, direction: "up" | "down") {
    const index = stages.findIndex((s) => s.id === id);
    if (index === -1) return;
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= stages.length) return;

    const current = stages[index];
    const swap = stages[swapIndex];

    startTransition(async () => {
      try {
        await Promise.all([
          fetch(`/api/workflow-stages/${current.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order: swap.order }),
          }),
          fetch(`/api/workflow-stages/${swap.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order: current.order }),
          }),
        ]);
        await fetchStages();
      } catch {
        toast({ title: "Failed to reorder stages", variant: "destructive" });
      }
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Workflow Stages</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Organize posts into custom Kanban-style stages
          </p>
        </div>
        {!creating && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Stage
          </Button>
        )}
      </div>

      {/* Create form */}
      {creating && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h2 className="font-medium text-sm">New Stage</h2>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. In Review"
              maxLength={100}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              onKeyDown={(e) => {
                if (e.key === "Enter") createStage();
                if (e.key === "Escape") { setCreating(false); setNewName(""); }
              }}
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Color</label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewColor(c)}
                  className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary"
                  style={{
                    backgroundColor: c,
                    borderColor: newColor === c ? "white" : "transparent",
                    boxShadow: newColor === c ? `0 0 0 2px ${c}` : undefined,
                  }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={createStage} disabled={isPending}>
              <Check className="mr-1 h-3 w-3" />
              Create
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setCreating(false); setNewName(""); }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Stage list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : stages.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">No workflow stages yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Create stages like &ldquo;Drafting&rdquo;, &ldquo;In Review&rdquo;, or &ldquo;Ready to Publish&rdquo;
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {stages.map((stage, index) => (
            <div
              key={stage.id}
              className="flex items-center gap-3 rounded-lg border bg-card p-3"
            >
              {/* Color dot */}
              <div
                className="h-4 w-4 shrink-0 rounded-full"
                style={{ backgroundColor: stage.color }}
              />

              {editingId === stage.id ? (
                /* Edit form inline */
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    maxLength={100}
                    className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") updateStage(stage.id);
                      if (e.key === "Escape") cancelEdit();
                    }}
                    autoFocus
                  />
                  <div className="flex gap-1">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setEditColor(c)}
                        className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110 focus:outline-none"
                        style={{
                          backgroundColor: c,
                          borderColor: editColor === c ? "white" : "transparent",
                          boxShadow: editColor === c ? `0 0 0 2px ${c}` : undefined,
                        }}
                        aria-label={c}
                      />
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => updateStage(stage.id)}
                    disabled={isPending}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={cancelEdit}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                /* Display row */
                <>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{stage.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {stage._count.posts} post{stage._count.posts !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => moveStage(stage.id, "up")}
                      disabled={index === 0 || isPending}
                      title="Move up"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => moveStage(stage.id, "down")}
                      disabled={index === stages.length - 1 || isPending}
                      title="Move down"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => startEdit(stage)}
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteStage(stage.id, stage._count.posts)}
                      title="Delete"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
