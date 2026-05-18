"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Settings2 } from "lucide-react";
import type { WidgetConfig } from "@/app/api/dashboard-widgets/route";

interface DashboardCustomizeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (widgets: WidgetConfig[]) => void;
}

export function DashboardCustomizeDialog({
  open,
  onOpenChange,
  onSave,
}: DashboardCustomizeDialogProps) {
  const [widgets, setWidgets] = useState<WidgetConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/dashboard-widgets")
      .then((r) => r.json())
      .then((data: { widgets: WidgetConfig[] }) => {
        setWidgets(data.widgets ?? []);
      })
      .catch(() => toast.error("Failed to load widget settings"))
      .finally(() => setLoading(false));
  }, [open]);

  function toggleWidget(key: string) {
    setWidgets((prev) =>
      prev.map((w) => (w.widgetKey === key ? { ...w, visible: !w.visible } : w))
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/dashboard-widgets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          widgets: widgets.map(({ widgetKey, visible, position }) => ({
            widgetKey,
            visible,
            position,
          })),
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      const data = (await res.json()) as { widgets: WidgetConfig[] };
      onSave(data.widgets);
      toast.success("Dashboard layout saved");
      onOpenChange(false);
    } catch {
      toast.error("Failed to save widget settings");
    } finally {
      setSaving(false);
    }
  }

  function showAll() {
    setWidgets((prev) => prev.map((w) => ({ ...w, visible: true })));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Customize Dashboard
          </DialogTitle>
        </DialogHeader>

        <div className="py-2">
          <p className="mb-4 text-sm text-muted-foreground">
            Toggle which analytics widgets are shown on your dashboard.
          </p>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="h-4 w-48 animate-pulse rounded bg-muted" />
                  <div className="h-5 w-9 animate-pulse rounded-full bg-muted" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {widgets.map((w) => (
                <div key={w.widgetKey} className="flex items-center justify-between">
                  <Label
                    htmlFor={`widget-${w.widgetKey}`}
                    className="cursor-pointer text-sm font-normal"
                  >
                    {w.label}
                  </Label>
                  <Switch
                    id={`widget-${w.widgetKey}`}
                    checked={w.visible}
                    onCheckedChange={() => toggleWidget(w.widgetKey)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          <Button variant="ghost" size="sm" onClick={showAll} disabled={loading}>
            Show all
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={loading || saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
