"use client";

import { ExternalLink } from "lucide-react";

interface LinkBioItem {
  id: string;
  label: string;
  url: string;
  icon: string | null;
  clicks: number;
}

interface Props {
  slug: string;
  items: LinkBioItem[];
}

export function BioPageLinks({ slug, items }: Props) {
  async function handleClick(itemId: string, url: string) {
    try {
      await fetch(`/api/bio/${slug}/click/${itemId}`, { method: "POST" });
    } catch {
      // fire-and-forget — do not block navigation
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-3 w-full">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => void handleClick(item.id, item.url)}
          className="flex w-full items-center justify-between gap-3 rounded-xl border bg-card px-5 py-4 text-left font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <span className="flex items-center gap-2">
            {item.icon && <span>{item.icon}</span>}
            {item.label}
          </span>
          <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      ))}
    </div>
  );
}
