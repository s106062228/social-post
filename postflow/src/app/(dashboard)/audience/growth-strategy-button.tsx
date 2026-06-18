"use client";

import { useState } from "react";
import { TrendingUp } from "lucide-react";
import { GrowthStrategyDialog } from "@/components/growth-strategy-dialog";

interface Props {
  platforms: string[];
}

export function GrowthStrategyButton({ platforms }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
      >
        <TrendingUp className="h-4 w-4" />
        Growth Strategy
      </button>
      {open && (
        <GrowthStrategyDialog platforms={platforms} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
