"use client";

import { useState, useEffect, useCallback } from "react";
import { CheckSquare, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface ChecklistItem {
  id: string;
  label: string;
  description: string | null;
  order: number;
  isActive: boolean;
}

interface PrePublishChecklistProps {
  postId: string | null;
}

export function PrePublishChecklist({ postId }: PrePublishChecklistProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/posts/${postId}/checklist`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        items?: ChecklistItem[];
        checks?: Record<string, boolean>;
      };
      setItems(data.items ?? []);
      setChecks(data.checks ?? {});
    } catch {
      // silently ignore — checklist is non-critical
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    if (open && postId) {
      void load();
    }
  }, [open, postId, load]);

  async function handleCheck(itemId: string, checked: boolean) {
    if (!postId) return;
    const next = { ...checks, [itemId]: checked };
    setChecks(next);
    setSaving(true);
    try {
      const res = await fetch(`/api/posts/${postId}/checklist`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checks: next }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to save");
      }
    } catch (err) {
      setChecks(checks);
      toast.error(err instanceof Error ? err.message : "Failed to save checklist");
    } finally {
      setSaving(false);
    }
  }

  const doneCount = items.filter((i) => checks[i.id] === true).length;
  const totalCount = items.length;

  if (!postId) {
    return null;
  }

  return (
    <div className="border rounded-md">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-accent/50 transition-colors rounded-md"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-2">
          <CheckSquare className="h-4 w-4 text-muted-foreground" />
          <span>Pre-publish Checklist</span>
          {totalCount > 0 && (
            <Badge
              variant={doneCount === totalCount ? "default" : "secondary"}
              className="text-xs"
            >
              {doneCount}/{totalCount}
            </Badge>
          )}
          {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 border-t">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3">
              No checklist items.{" "}
              <a href="/checklist" className="underline hover:text-foreground">
                Set up your checklist
              </a>{" "}
              in Settings → Checklist.
            </p>
          ) : (
            <div className="space-y-3 pt-3">
              {items.map((item) => (
                <div key={item.id} className="flex items-start gap-3">
                  <Checkbox
                    id={`check-${item.id}`}
                    checked={checks[item.id] === true}
                    onCheckedChange={(checked) =>
                      void handleCheck(item.id, checked === true)
                    }
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <Label
                      htmlFor={`check-${item.id}`}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {item.label}
                    </Label>
                    {item.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {item.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
