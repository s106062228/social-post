"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";

interface DateRangeFilterProps {
  defaultFrom: string;
  defaultTo: string;
}

export function DateRangeFilter({ defaultFrom, defaultTo }: DateRangeFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function applyDate(field: "from" | "to", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      // Convert local date to ISO datetime at start/end of day
      const iso = field === "from" ? `${value}T00:00:00.000Z` : `${value}T23:59:59.999Z`;
      params.set(field, iso);
    } else {
      params.delete(field);
    }
    params.delete("page");
    router.push(`/posts?${params.toString()}`);
  }

  function clearDates() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("from");
    params.delete("to");
    params.delete("page");
    router.push(`/posts?${params.toString()}`);
  }

  const hasFilter = defaultFrom || defaultTo;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Date:</span>
      <input
        type="date"
        defaultValue={defaultFrom ? defaultFrom.slice(0, 10) : ""}
        onChange={(e) => applyDate("from", e.target.value)}
        className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="From date"
      />
      <span className="text-sm text-muted-foreground">—</span>
      <input
        type="date"
        defaultValue={defaultTo ? defaultTo.slice(0, 10) : ""}
        onChange={(e) => applyDate("to", e.target.value)}
        className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="To date"
      />
      {hasFilter && (
        <button
          type="button"
          onClick={clearDates}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          aria-label="Clear date filter"
        >
          <X className="h-3 w-3" />
          Clear
        </button>
      )}
    </div>
  );
}
