"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { toast } from "@/hooks/use-toast";

type WorkflowStage = {
  id: string;
  name: string;
  color: string;
};

interface WorkflowStageSelectorProps {
  postId: string;
  currentStageId: string | null;
  onStageChanged?: () => void;
}

export function WorkflowStageSelector({
  postId,
  currentStageId,
  onStageChanged,
}: WorkflowStageSelectorProps) {
  const [stages, setStages] = useState<WorkflowStage[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(currentStageId);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/workflow-stages")
      .then((r) => r.json())
      .then((data: { stages?: WorkflowStage[] }) => {
        if (data.stages) setStages(data.stages);
      })
      .catch(() => {
        // silently fail — widget is optional
      });
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (stages.length === 0) return null;

  const currentStage = stages.find((s) => s.id === selectedId) ?? null;

  function assign(stageId: string | null) {
    setOpen(false);
    startTransition(async () => {
      const previousId = selectedId;
      setSelectedId(stageId); // optimistic
      try {
        const res = await fetch(`/api/posts/${postId}/workflow-stage`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workflowStageId: stageId }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Update failed");
        }
        onStageChanged?.();
      } catch (err) {
        setSelectedId(previousId); // rollback
        toast({
          title: "Failed to update stage",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
      }
    });
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-60"
        style={
          currentStage
            ? { backgroundColor: currentStage.color + "22", borderColor: currentStage.color, color: currentStage.color }
            : undefined
        }
        title="Workflow stage"
      >
        {currentStage ? (
          <>
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: currentStage.color }}
            />
            {currentStage.name}
          </>
        ) : (
          <span className="text-muted-foreground">No stage</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-md border bg-card shadow-lg">
          <div className="p-1">
            <button
              type="button"
              onClick={() => assign(null)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent"
            >
              <span className="h-2 w-2 rounded-full bg-muted-foreground/30 shrink-0" />
              <span className="text-muted-foreground">No stage</span>
            </button>
            {stages.map((stage) => (
              <button
                key={stage.id}
                type="button"
                onClick={() => assign(stage.id)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent"
              >
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: stage.color }}
                />
                <span className="truncate">{stage.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
