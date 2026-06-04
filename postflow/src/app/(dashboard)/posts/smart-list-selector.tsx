"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ListFilter, ChevronDown, Pin, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface SmartListFilters {
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
}

interface SmartList {
  id: string;
  name: string;
  filters: SmartListFilters;
  pinned: boolean;
  createdAt: string;
}

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

export function SmartListSelector() {
  const router = useRouter();
  const [smartLists, setSmartLists] = useState<SmartList[]>([]);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function loadSmartLists() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/smart-lists");
        if (res.ok) {
          const data = (await res.json()) as { smartLists: SmartList[] };
          setSmartLists(data.smartLists);
        }
      } catch {
        // silent fail
      }
    });
  }

  useEffect(() => {
    loadSmartLists();
  }, []);

  function applySmartList(list: SmartList) {
    const qs = filtersToQueryParams(list.filters);
    router.push(`/posts${qs ? `?${qs}` : ""}`);
    setOpen(false);
  }

  function deleteSmartList(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    startTransition(async () => {
      try {
        const res = await fetch(`/api/smart-lists/${id}`, { method: "DELETE" });
        if (!res.ok && res.status !== 204) {
          throw new Error("Failed to delete smart list");
        }
        setSmartLists((prev) => prev.filter((l) => l.id !== id));
        toast({ title: "Smart list deleted", variant: "success" });
      } catch (err) {
        toast({
          title: "Failed to delete smart list",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
      }
    });
  }

  if (smartLists.length === 0 && !isPending) return null;

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1"
      >
        <ListFilter className="h-3.5 w-3.5" />
        Smart Lists
        <ChevronDown className="h-3 w-3 opacity-60" />
      </Button>

      {open && (
        <>
          {/* backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-64 rounded-md border bg-popover shadow-md">
            {smartLists.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">No smart lists saved</p>
            ) : (
              <ul className="py-1">
                {smartLists.map((list) => (
                  <li key={list.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                      onClick={() => applySmartList(list)}
                    >
                      <span className="flex items-center gap-1.5 truncate text-left">
                        {list.pinned && <Pin className="h-3 w-3 text-primary shrink-0" />}
                        <span className="truncate">{list.name}</span>
                      </span>
                      <span
                        role="button"
                        className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive"
                        onClick={(e) => deleteSmartList(list.id, e)}
                        title="Delete smart list"
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
