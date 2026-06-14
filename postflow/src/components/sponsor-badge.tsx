"use client";

import { Megaphone } from "lucide-react";

interface SponsorBadgeProps {
  sponsorName?: string | null;
  disclosureText?: string | null;
}

export function SponsorBadge({ sponsorName, disclosureText }: SponsorBadgeProps) {
  const tooltip = sponsorName
    ? `Sponsored by ${sponsorName}${disclosureText ? ` · ${disclosureText}` : ""}`
    : (disclosureText ?? "Sponsored content");

  return (
    <span
      title={tooltip}
      className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
    >
      <Megaphone className="h-3 w-3" />
      Sponsored
    </span>
  );
}
