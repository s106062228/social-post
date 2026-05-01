"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { BookmarkCheck, Trash2, ChevronDown } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface FilterPreset {
  id: string;
  name: string;
  filters: Record<string, string | undefined>;
  createdAt: string;
}

export function FilterPresetSelector() {
  const router = useRouter();
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function loadPresets() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/filter-presets");
        if (res.ok) {
          const data = (await res.json()) as { presets: FilterPreset[] };
          setPresets(data.presets);
        }
      } catch {
        // silent fail — not critical
      }
    });
  }

  useEffect(() => {
    loadPresets();
  }, []);

  function applyPreset(preset: FilterPreset) {
    const params = new URLSearchParams();
    const f = preset.filters;
    if (f.status) params.set("status", f.status);
    if (f.search) params.set("search", f.search);
    if (f.tag) params.set("tag", f.tag);
    if (f.platform) params.set("platform", f.platform);
    if (f.starred) params.set("starred", f.starred);
    if (f.evergreen) params.set("evergreen", f.evergreen);
    if (f.from) params.set("from", f.from);
    if (f.to) params.set("to", f.to);
    const qs = params.toString();
    router.push(`/posts${qs ? `?${qs}` : ""}`);
    setOpen(false);
  }

  function deletePreset(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    startTransition(async () => {
      try {
        const res = await fetch(`/api/filter-presets/${id}`, { method: "DELETE" });
        if (!res.ok && res.status !== 204) {
          throw new Error("Failed to delete preset");
        }
        setPresets((prev) => prev.filter((p) => p.id !== id));
        toast({ title: "Preset deleted", variant: "success" });
      } catch (err) {
        toast({
          title: "Failed to delete preset",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
      }
    });
  }

  if (presets.length === 0 && !isPending) return null;

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1"
      >
        <BookmarkCheck className="h-3.5 w-3.5" />
        Presets
        <ChevronDown className="h-3 w-3 opacity-60" />
      </Button>

      {open && (
        <>
          {/* backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-md border bg-popover shadow-md">
            {presets.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">No presets saved</p>
            ) : (
              <ul className="py-1">
                {presets.map((preset) => (
                  <li key={preset.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                      onClick={() => applyPreset(preset)}
                    >
                      <span className="truncate text-left">{preset.name}</span>
                      <span
                        role="button"
                        className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive"
                        onClick={(e) => deletePreset(preset.id, e)}
                        title="Delete preset"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
