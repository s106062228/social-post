"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Bookmark, BookmarkCheck, ChevronDown, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface SavedView {
  id: string;
  name: string;
  reportType: string;
  config: Record<string, unknown>;
  createdAt: string;
}

interface Props {
  currentPeriod: string;
  onApply: (config: Record<string, unknown>) => void;
}

export function SavedAnalyticsViews({ currentPeriod, onApply }: Props) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  function loadViews() {
    fetch("/api/analytics/saved-views")
      .then((r) => r.json())
      .then((data: { views: SavedView[] }) => setViews(data.views ?? []))
      .catch(() => {/* silently fail */});
  }

  useEffect(() => {
    loadViews();
  }, []);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/analytics/saved-views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          reportType: "DASHBOARD",
          config: { period: currentPeriod },
        }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        toast.error(err.error ?? "Failed to save view");
        return;
      }
      toast.success("View saved");
      setSaveOpen(false);
      setName("");
      loadViews();
    } catch {
      toast.error("Failed to save view");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, viewName: string) {
    try {
      const res = await fetch(`/api/analytics/saved-views/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("Failed to delete view");
        return;
      }
      toast.success(`"${viewName}" deleted`);
      setViews((prev) => prev.filter((v) => v.id !== id));
    } catch {
      toast.error("Failed to delete view");
    }
  }

  return (
    <>
      <div className="flex items-center gap-1">
        {/* Saved views dropdown */}
        {views.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1">
                <BookmarkCheck className="h-4 w-4" />
                Saved Views
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Saved Views</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {views.map((view) => (
                <DropdownMenuItem
                  key={view.id}
                  className="flex items-center justify-between gap-2"
                  onSelect={(e) => e.preventDefault()}
                >
                  <button
                    className="flex-1 text-left text-sm"
                    onClick={() => onApply(view.config)}
                  >
                    {view.name}
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({String(view.config.period ?? "")})
                    </span>
                  </button>
                  <button
                    onClick={() => handleDelete(view.id, view.name)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Save current view button */}
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => setSaveOpen(true)}
        >
          <Bookmark className="h-4 w-4" />
          Save View
        </Button>
      </div>

      {/* Save view dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save Analytics View</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="mb-3 text-sm text-muted-foreground">
              Saves the current period ({currentPeriod}) as a named view.
            </p>
            <Input
              placeholder="View name (e.g. Weekly Check-in)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSave();
              }}
              maxLength={100}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} disabled={!name.trim() || saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
