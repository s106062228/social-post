"use client";

import { cn } from "@/lib/utils";

export type PlatformId = "FACEBOOK" | "INSTAGRAM" | "THREADS";

interface Platform {
  id: PlatformId;
  name: string;
  color: string;
}

const PLATFORMS: Platform[] = [
  { id: "FACEBOOK", name: "Facebook", color: "bg-blue-100 text-blue-800 border-blue-300" },
  { id: "INSTAGRAM", name: "Instagram", color: "bg-pink-100 text-pink-800 border-pink-300" },
  { id: "THREADS", name: "Threads", color: "bg-gray-100 text-gray-800 border-gray-300" },
];

interface PlatformSelectorProps {
  selected: PlatformId[];
  onChange: (selected: PlatformId[]) => void;
  availablePlatforms?: PlatformId[];
}

export function PlatformSelector({
  selected,
  onChange,
  availablePlatforms,
}: PlatformSelectorProps) {
  const platforms = availablePlatforms
    ? PLATFORMS.filter((p) => availablePlatforms.includes(p.id))
    : PLATFORMS;

  const toggle = (id: PlatformId) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {platforms.map((platform) => {
        const isSelected = selected.includes(platform.id);
        return (
          <button
            key={platform.id}
            type="button"
            onClick={() => toggle(platform.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm font-medium transition-all",
              isSelected
                ? platform.color + " ring-2 ring-offset-1"
                : "bg-background text-muted-foreground border-border hover:bg-accent"
            )}
          >
            {platform.name}
          </button>
        );
      })}
    </div>
  );
}
