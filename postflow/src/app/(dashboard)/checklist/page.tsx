"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CheckSquare,
  Plus,
  Trash2,
  Loader2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface ChecklistItem {
  id: string;
  label: string;
  description: string | null;
  order: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function ChecklistPage() {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newOrder, setNewOrder] = useState("0");
  const [saving, setSaving] = useState(false);

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/checklist-items");
      const data = (await res.json()) as { items?: ChecklistItem[] };
      setItems(data.items ?? []);
    } catch {
      toast.error("Failed to load checklist items");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    if (!newLabel.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/checklist-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: newLabel.trim(),
          description: newDescription.trim() || null,
          order: parseInt(newOrder, 10) || 0,
        }),
      });
      const data = (await res.json()) as { item?: ChecklistItem; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to create item");
      if (data.item) setItems((prev) => [...prev, data.item!]);
      setNewLabel("");
      setNewDescription("");
      setNewOrder("0");
      setCreating(false);
      toast.success("Checklist item created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create item");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(item: ChecklistItem) {
    setTogglingId(item.id);
    try {
      const res = await fetch(`/api/checklist-items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      const data = (await res.json()) as { item?: ChecklistItem; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to update item");
      if (data.item) {
        setItems((prev) => prev.map((i) => (i.id === item.id ? data.item! : i)));
      }
      toast.success(item.isActive ? "Item deactivated" : "Item activated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update item");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/checklist-items/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to delete item");
      }
      setItems((prev) => prev.filter((i) => i.id !== id));
      toast.success("Checklist item deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete item");
    } finally {
      setDeletingId(null);
    }
  }

  const activeItems = items.filter((i) => i.isActive);
  const inactiveItems = items.filter((i) => !i.isActive);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CheckSquare className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Pre-publish Checklist</h1>
            <p className="text-sm text-muted-foreground">
              Define items to verify before publishing a post
            </p>
          </div>
        </div>
        {!creating && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Item
          </Button>
        )}
      </div>

      {creating && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New Checklist Item</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2 space-y-1">
                <Label htmlFor="new-label">Label *</Label>
                <Input
                  id="new-label"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="e.g. Proofread content"
                  maxLength={200}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-order">Order</Label>
                <Input
                  id="new-order"
                  type="number"
                  min={0}
                  value={newOrder}
                  onChange={(e) => setNewOrder(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-description">Description (optional)</Label>
              <Input
                id="new-description"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Additional details about this check"
                maxLength={500}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setCreating(false);
                  setNewLabel("");
                  setNewDescription("");
                  setNewOrder("0");
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void handleCreate()}
                disabled={saving || !newLabel.trim()}
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Item
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <CheckSquare className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-medium">No checklist items yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Add items that you want to verify before publishing each post.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {activeItems.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Active ({activeItems.length})
              </h2>
              {activeItems.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                  togglingId={togglingId}
                  deletingId={deletingId}
                />
              ))}
            </div>
          )}
          {inactiveItems.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Inactive ({inactiveItems.length})
              </h2>
              {inactiveItems.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                  togglingId={togglingId}
                  deletingId={deletingId}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ItemRow({
  item,
  onToggle,
  onDelete,
  togglingId,
  deletingId,
}: {
  item: ChecklistItem;
  onToggle: (item: ChecklistItem) => void;
  onDelete: (id: string) => void;
  togglingId: string | null;
  deletingId: string | null;
}) {
  return (
    <Card className={item.isActive ? "" : "opacity-60"}>
      <CardContent className="flex items-center gap-3 py-3 px-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{item.label}</span>
            <Badge variant="outline" className="text-xs shrink-0">
              #{item.order}
            </Badge>
            {!item.isActive && (
              <Badge variant="secondary" className="text-xs">
                Inactive
              </Badge>
            )}
          </div>
          {item.description && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {item.description}
            </p>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onToggle(item)}
            disabled={togglingId === item.id}
            title={item.isActive ? "Deactivate" : "Activate"}
          >
            {togglingId === item.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : item.isActive ? (
              <ToggleRight className="h-4 w-4 text-primary" />
            ) : (
              <ToggleLeft className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => onDelete(item.id)}
            disabled={deletingId === item.id}
            title="Delete"
          >
            {deletingId === item.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
