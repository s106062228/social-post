"use client";

import { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { findNextOccurrence, formatPresetLabel, toDatetimeLocal } from "@/lib/schedule-time-presets";

interface Preset {
  id: string;
  name: string;
  hour: number;
  minute: number;
  daysOfWeek: number[];
  timezone: string;
}

interface Props {
  onSelect: (datetimeLocal: string) => void;
}

export function SchedulePresetSelector({ onSelect }: Props) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/schedule-presets")
      .then((r) => r.json())
      .then((d: { presets?: Preset[] }) => {
        setPresets(d.presets ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function apply(preset: Preset) {
    const next = findNextOccurrence(preset);
    if (next) {
      onSelect(toDatetimeLocal(next));
    }
  }

  if (loading || presets.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-2">
          <Clock className="h-3.5 w-3.5" />
          Presets
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {presets.map((preset, i) => (
          <div key={preset.id}>
            {i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem
              onClick={() => apply(preset)}
              className="flex flex-col items-start gap-0.5 py-2"
            >
              <span className="font-medium">{preset.name}</span>
              <span className="text-xs text-muted-foreground">
                {formatPresetLabel(preset)}
              </span>
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
