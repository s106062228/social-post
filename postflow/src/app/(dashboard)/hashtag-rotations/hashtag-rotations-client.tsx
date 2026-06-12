"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw,
  Trash2,
  ChevronUp,
  ChevronDown,
  Plus,
  Hash,
} from "lucide-react";

interface HashtagGroup {
  id: string;
  name: string;
  hashtags: string[];
}

interface HashtagRotation {
  id: string;
  name: string;
  description: string | null;
  groupIds: string[];
  currentIndex: number;
  isActive: boolean;
  groups: HashtagGroup[];
  currentGroup: HashtagGroup | null;
}

interface Props {
  initialRotations: HashtagRotation[];
  availableGroups: HashtagGroup[];
}

export function HashtagRotationsClient({
  initialRotations,
  availableGroups,
}: Props) {
  const [rotations, setRotations] = useState<HashtagRotation[]>(initialRotations);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);

  async function handleCreate() {
    if (!newName.trim() || selectedGroupIds.length === 0) {
      toast.error("Name and at least one group are required");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/hashtag-rotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDescription.trim() || undefined,
          groupIds: selectedGroupIds,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to create rotation");
      }
      const created = await res.json();
      const groupMap = new Map(availableGroups.map((g) => [g.id, g]));
      const enriched: HashtagRotation = {
        ...created,
        groups: created.groupIds
          .map((id: string) => groupMap.get(id))
          .filter(Boolean),
        currentGroup: groupMap.get(created.groupIds[0] ?? "") ?? null,
      };
      setRotations((prev) => [enriched, ...prev]);
      setNewName("");
      setNewDescription("");
      setSelectedGroupIds([]);
      setShowCreate(false);
      toast.success("Rotation created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create rotation");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/hashtag-rotations/${id}`, {
      method: "DELETE",
    });
    if (res.ok || res.status === 204) {
      setRotations((prev) => prev.filter((r) => r.id !== id));
      toast.success("Rotation deleted");
    } else {
      toast.error("Failed to delete rotation");
    }
  }

  async function handleToggleActive(rotation: HashtagRotation) {
    const res = await fetch(`/api/hashtag-rotations/${rotation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !rotation.isActive }),
    });
    if (res.ok) {
      const updated = await res.json();
      setRotations((prev) =>
        prev.map((r) =>
          r.id === rotation.id ? { ...r, isActive: updated.isActive } : r
        )
      );
      toast.success(updated.isActive ? "Rotation activated" : "Rotation paused");
    } else {
      toast.error("Failed to update rotation");
    }
  }

  async function handleMoveGroup(rotation: HashtagRotation, fromIndex: number, toIndex: number) {
    const newGroupIds = [...rotation.groupIds];
    const [moved] = newGroupIds.splice(fromIndex, 1);
    newGroupIds.splice(toIndex, 0, moved);

    const res = await fetch(`/api/hashtag-rotations/${rotation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupIds: newGroupIds }),
    });
    if (res.ok) {
      const updated = await res.json();
      const groupMap = new Map(availableGroups.map((g) => [g.id, g]));
      setRotations((prev) =>
        prev.map((r) =>
          r.id === rotation.id
            ? {
                ...r,
                groupIds: updated.groupIds,
                currentIndex: updated.currentIndex,
                groups: updated.groupIds
                  .map((id: string) => groupMap.get(id))
                  .filter(Boolean),
                currentGroup: groupMap.get(updated.groupIds[updated.currentIndex] ?? "") ?? null,
              }
            : r
        )
      );
      toast.success("Order updated");
    } else {
      toast.error("Failed to reorder groups");
    }
  }

  function toggleGroupSelect(groupId: string) {
    setSelectedGroupIds((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId]
    );
  }

  function moveSelected(groupId: string, direction: "up" | "down") {
    const idx = selectedGroupIds.indexOf(groupId);
    if (idx < 0) return;
    const newIds = [...selectedGroupIds];
    if (direction === "up" && idx > 0) {
      [newIds[idx - 1], newIds[idx]] = [newIds[idx], newIds[idx - 1]];
    } else if (direction === "down" && idx < newIds.length - 1) {
      [newIds[idx], newIds[idx + 1]] = [newIds[idx + 1], newIds[idx]];
    }
    setSelectedGroupIds(newIds);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Create button */}
      <div className="flex gap-3">
        <Button onClick={() => setShowCreate((v) => !v)} variant="outline">
          <Plus className="mr-2 h-4 w-4" />
          New Rotation
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Create Hashtag Rotation</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                placeholder="e.g. Monday Rotation"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Description (optional)</label>
              <Textarea
                placeholder="What is this rotation for?"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={2}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">
                Select Hashtag Groups (in order)
              </label>
              {availableGroups.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hashtag groups yet.{" "}
                  <a href="/hashtags" className="underline">
                    Create some first.
                  </a>
                </p>
              ) : (
                <div className="flex flex-col gap-2 rounded border p-3 max-h-48 overflow-y-auto">
                  {availableGroups.map((g) => {
                    const isSelected = selectedGroupIds.includes(g.id);
                    const position = selectedGroupIds.indexOf(g.id);
                    return (
                      <div
                        key={g.id}
                        className="flex items-center gap-3"
                      >
                        <button
                          type="button"
                          onClick={() => toggleGroupSelect(g.id)}
                          className={`flex flex-1 items-start gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                            isSelected
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted hover:bg-muted/80"
                          }`}
                        >
                          <span className="font-medium">{g.name}</span>
                          <span className="ml-auto text-xs opacity-70">
                            {g.hashtags.length} tags
                          </span>
                        </button>
                        {isSelected && (
                          <div className="flex flex-col gap-0.5">
                            <button
                              type="button"
                              onClick={() => moveSelected(g.id, "up")}
                              disabled={position === 0}
                              className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                            >
                              <ChevronUp className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveSelected(g.id, "down")}
                              disabled={position === selectedGroupIds.length - 1}
                              className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                            >
                              <ChevronDown className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {selectedGroupIds.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Selected order: {selectedGroupIds
                    .map((id) => availableGroups.find((g) => g.id === id)?.name)
                    .join(" → ")}
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? "Creating…" : "Create Rotation"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowCreate(false);
                  setNewName("");
                  setNewDescription("");
                  setSelectedGroupIds([]);
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rotations list */}
      {rotations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <RefreshCw className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No rotations yet</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Create a rotation to cycle through hashtag groups automatically.
              Each time you use &quot;Insert &amp; Advance&quot; in the post composer,
              it will move to the next group.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {rotations.map((rotation) => (
            <RotationCard
              key={rotation.id}
              rotation={rotation}
              availableGroups={availableGroups}
              onDelete={() => handleDelete(rotation.id)}
              onToggleActive={() => handleToggleActive(rotation)}
              onMoveGroup={(from, to) => handleMoveGroup(rotation, from, to)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RotationCard({
  rotation,
  availableGroups,
  onDelete,
  onToggleActive,
  onMoveGroup,
}: {
  rotation: HashtagRotation;
  availableGroups: HashtagGroup[];
  onDelete: () => void;
  onToggleActive: () => void;
  onMoveGroup: (from: number, to: number) => void;
}) {
  const groupMap = new Map(availableGroups.map((g) => [g.id, g]));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{rotation.name}</CardTitle>
              <Badge variant={rotation.isActive ? "default" : "secondary"}>
                {rotation.isActive ? "Active" : "Paused"}
              </Badge>
            </div>
            {rotation.description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {rotation.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onToggleActive}
            >
              {rotation.isActive ? "Pause" : "Activate"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onDelete}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {rotation.groupIds.length === 0 ? (
          <p className="text-sm text-muted-foreground">No groups in this rotation.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Groups ({rotation.groupIds.length}) — Next up: slot {rotation.currentIndex + 1}
            </p>
            {rotation.groupIds.map((groupId, idx) => {
              const group = groupMap.get(groupId);
              if (!group) return null;
              const isCurrent = idx === rotation.currentIndex;
              return (
                <div
                  key={groupId}
                  className={`flex items-center gap-3 rounded-md border px-3 py-2 ${
                    isCurrent ? "border-primary bg-primary/5" : "bg-muted/50"
                  }`}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-xs font-mono text-muted-foreground w-5 text-center">
                      {idx + 1}
                    </span>
                    {isCurrent && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0">
                        next
                      </Badge>
                    )}
                    <Hash className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium truncate">{group.name}</span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {group.hashtags.length} tags
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => onMoveGroup(idx, idx - 1)}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === rotation.groupIds.length - 1}
                      onClick={() => onMoveGroup(idx, idx + 1)}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {rotation.currentGroup && (
          <div className="mt-3 rounded-md bg-muted p-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">
              Current hashtags ({rotation.currentGroup.name}):
            </p>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {rotation.currentGroup.hashtags.join(" ")}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
