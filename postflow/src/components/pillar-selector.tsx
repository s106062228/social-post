"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronDown, Circle } from "lucide-react";

interface PillarOption {
  id: string;
  name: string;
  color: string;
}

interface PillarSelectorProps {
  selectedPillarId: string | null;
  onChange: (pillarId: string | null) => void;
}

export function PillarSelector({ selectedPillarId, onChange }: PillarSelectorProps) {
  const [pillars, setPillars] = useState<PillarOption[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/content-pillars")
      .then((r) => r.json())
      .then((data: { pillars?: PillarOption[] }) => {
        if (data.pillars) setPillars(data.pillars);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selected = pillars.find((p) => p.id === selectedPillarId) ?? null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent transition-colors min-w-[160px]"
      >
        {selected ? (
          <>
            <span
              className="inline-block h-3 w-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: selected.color }}
            />
            <span className="truncate flex-1 text-left">{selected.name}</span>
          </>
        ) : (
          <>
            <Circle className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            <span className="flex-1 text-left text-muted-foreground">No pillar</span>
          </>
        )}
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-56 rounded-md border bg-popover shadow-md">
          <div className="p-1">
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false); }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent transition-colors"
            >
              <Circle className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">No pillar</span>
            </button>

            {pillars.length > 0 && (
              <div className="my-1 border-t" />
            )}

            {pillars.map((pillar) => (
              <button
                key={pillar.id}
                type="button"
                onClick={() => { onChange(pillar.id); setOpen(false); }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent transition-colors"
              >
                <span
                  className="inline-block h-3 w-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: pillar.color }}
                />
                <span className="truncate">{pillar.name}</span>
                {selectedPillarId === pillar.id && (
                  <span className="ml-auto text-xs text-primary">✓</span>
                )}
              </button>
            ))}

            {pillars.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                No pillars yet — create one in Pillars.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
