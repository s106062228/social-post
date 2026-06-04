"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Pin, PinOff, Pencil, Trash2, Plus, Check, X, ListFilter, ExternalLink } from "lucide-react";

type SmartListFilters = {
  statuses?: string[];
  platforms?: string[];
  sentiment?: string;
  tagIds?: string[];
  starred?: boolean;
  evergreen?: boolean;
  archived?: boolean;
  contentContains?: string;
  scheduledFrom?: string;
  scheduledTo?: string;
  contentCategory?: string;
  workflowStageId?: string;
  mediaType?: string;
};

type SmartList = {
  id: string;
  name: string;
  description: string | null;
  filters: SmartListFilters;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

const FILTER_LABELS: Record<string, string> = {
  statuses: "Statuses",
  platforms: "Platforms",
  sentiment: "Sentiment",
  tagIds: "Tags",
  starred: "Starred",
  evergreen: "Evergreen",
  archived: "Archived",
  contentContains: "Content contains",
  scheduledFrom: "Scheduled from",
  scheduledTo: "Scheduled to",
  contentCategory: "Category",
  workflowStageId: "Stage",
  mediaType: "Media type",
};

function filtersToQueryParams(filters: SmartListFilters): string {
  const params = new URLSearchParams();
  if (filters.statuses?.length) params.set("status", filters.statuses[0]);
  if (filters.platforms?.length) params.set("platform", filters.platforms[0]);
  if (filters.sentiment) params.set("sentiment", filters.sentiment);
  if (filters.tagIds?.length) params.set("tag", filters.tagIds[0]);
  if (filters.starred) params.set("starred", "true");
  if (filters.evergreen) params.set("evergreen", "true");
  if (filters.archived) params.set("archived", "true");
  if (filters.contentContains) params.set("search", filters.contentContains);
  if (filters.scheduledFrom) params.set("from", filters.scheduledFrom);
  if (filters.scheduledTo) params.set("to", filters.scheduledTo);
  if (filters.contentCategory) params.set("contentCategory", filters.contentCategory);
  if (filters.workflowStageId) params.set("workflowStageId", filters.workflowStageId);
  if (filters.mediaType) params.set("mediaType", filters.mediaType);
  return params.toString();
}

function FilterSummary({ filters }: { filters: SmartListFilters }) {
  const chips: string[] = [];
  if (filters.statuses?.length) chips.push(`Status: ${filters.statuses.join(", ")}`);
  if (filters.platforms?.length) chips.push(`Platform: ${filters.platforms.join(", ")}`);
  if (filters.contentContains) chips.push(`Contains: "${filters.contentContains}"`);
  if (filters.sentiment) chips.push(`Sentiment: ${filters.sentiment}`);
  if (filters.starred) chips.push("Starred");
  if (filters.evergreen) chips.push("Evergreen");
  if (filters.archived) chips.push("Archived");
  if (filters.tagIds?.length) chips.push(`Tags: ${filters.tagIds.length}`);
  if (filters.contentCategory) chips.push(`Category: ${filters.contentCategory}`);
  if (filters.mediaType) chips.push(`Media: ${filters.mediaType}`);
  if (filters.workflowStageId) chips.push("Has stage");

  if (chips.length === 0) {
    return <span className="text-xs text-muted-foreground">No filters — shows all posts</span>;
  }

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {chips.map((chip) => (
        <span
          key={chip}
          className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
        >
          {chip}
        </span>
      ))}
    </div>
  );
}

export default function SmartListsPage() {
  const [smartLists, setSmartLists] = useState<SmartList[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newFilters, setNewFilters] = useState<SmartListFilters>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [isPending, startTransition] = useTransition();

  async function fetchSmartLists() {
    setLoading(true);
    try {
      const res = await fetch("/api/smart-lists");
      if (!res.ok) throw new Error("Failed to load smart lists");
      const data = (await res.json()) as { smartLists: SmartList[] };
      setSmartLists(data.smartLists);
    } catch {
      toast({ title: "Failed to load smart lists", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchSmartLists();
  }, []);

  function createSmartList() {
    if (!newName.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/smart-lists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: newName.trim(),
            description: newDescription.trim() || undefined,
            filters: newFilters,
            pinned: false,
          }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Create failed");
        }
        toast({ title: "Smart list created", variant: "success" });
        setNewName("");
        setNewDescription("");
        setNewFilters({});
        setCreating(false);
        await fetchSmartLists();
      } catch (err) {
        toast({
          title: "Failed to create smart list",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
      }
    });
  }

  function startEdit(list: SmartList) {
    setEditingId(list.id);
    setEditName(list.name);
    setEditDescription(list.description ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditDescription("");
  }

  function updateSmartList(id: string) {
    if (!editName.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/smart-lists/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: editName.trim(),
            description: editDescription.trim() || null,
          }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Update failed");
        }
        toast({ title: "Smart list updated", variant: "success" });
        cancelEdit();
        await fetchSmartLists();
      } catch (err) {
        toast({
          title: "Failed to update smart list",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
      }
    });
  }

  function togglePin(list: SmartList) {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/smart-lists/${list.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pinned: !list.pinned }),
        });
        if (!res.ok) throw new Error("Toggle failed");
        await fetchSmartLists();
      } catch {
        toast({ title: "Failed to toggle pin", variant: "destructive" });
      }
    });
  }

  function deleteSmartList(id: string, name: string) {
    if (!confirm(`Delete smart list "${name}"?`)) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/smart-lists/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Delete failed");
        toast({ title: "Smart list deleted", variant: "success" });
        await fetchSmartLists();
      } catch {
        toast({ title: "Failed to delete smart list", variant: "destructive" });
      }
    });
  }

  const _ = FILTER_LABELS; // suppress unused warning

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ListFilter className="h-6 w-6" />
            Smart Lists
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Save advanced filter combinations to quickly access specific post groups
          </p>
        </div>
        {!creating && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Smart List
          </Button>
        )}
      </div>

      {/* Create form */}
      {creating && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h2 className="font-medium text-sm">New Smart List</h2>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Name *</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Published Facebook Posts"
              maxLength={100}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              onKeyDown={(e) => {
                if (e.key === "Enter") createSmartList();
                if (e.key === "Escape") {
                  setCreating(false);
                  setNewName("");
                  setNewDescription("");
                }
              }}
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Description (optional)</label>
            <input
              type="text"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Brief description of this list"
              maxLength={500}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">
              <strong>Tip:</strong> To create a smart list with specific filters, go to the{" "}
              <Link href="/posts" className="underline hover:no-underline">
                Posts page
              </Link>
              , apply your filters, then click &ldquo;Save as Smart List&rdquo;.
            </p>
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={createSmartList} disabled={isPending}>
              <Check className="mr-1 h-3 w-3" />
              Create
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setCreating(false);
                setNewName("");
                setNewDescription("");
                setNewFilters({});
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Smart list items */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : smartLists.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <ListFilter className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No smart lists yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Create smart lists to save filter combinations you use frequently
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {smartLists.map((list) => (
            <div key={list.id} className="rounded-lg border bg-card p-4">
              {editingId === list.id ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    maxLength={100}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") updateSmartList(list.id);
                      if (e.key === "Escape") cancelEdit();
                    }}
                    autoFocus
                  />
                  <input
                    type="text"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    maxLength={500}
                    placeholder="Description (optional)"
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => updateSmartList(list.id)}
                      disabled={isPending}
                    >
                      <Check className="mr-1 h-3 w-3" />
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={cancelEdit}>
                      <X className="mr-1 h-3 w-3" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {list.pinned && (
                        <Pin className="h-3 w-3 text-primary shrink-0" />
                      )}
                      <span className="font-medium text-sm">{list.name}</span>
                    </div>
                    {list.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{list.description}</p>
                    )}
                    <FilterSummary filters={list.filters} />
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Link
                      href={`/posts?${filtersToQueryParams(list.filters)}`}
                      title="View posts"
                    >
                      <Button size="sm" variant="outline" className="h-8 text-xs">
                        <ExternalLink className="mr-1 h-3 w-3" />
                        View Posts
                      </Button>
                    </Link>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => togglePin(list)}
                      title={list.pinned ? "Unpin" : "Pin to top"}
                      disabled={isPending}
                    >
                      {list.pinned ? (
                        <PinOff className="h-4 w-4" />
                      ) : (
                        <Pin className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => startEdit(list)}
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => deleteSmartList(list.id, list.name)}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
