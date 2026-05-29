"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";

interface AccountHealth {
  accountId: string;
  accountName: string;
  platform: string;
  healthStatus: "ok" | "expiring" | "expired" | "invalid" | null;
}

export function AccountHealthBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [unhealthyAccounts, setUnhealthyAccounts] = useState<AccountHealth[]>(
    []
  );

  useEffect(() => {
    async function fetchHealth() {
      try {
        const res = await fetch("/api/accounts/health");
        if (!res.ok) return;
        const data = (await res.json()) as { health: AccountHealth[] };
        const unhealthy = data.health.filter(
          (a: AccountHealth) => a.healthStatus === "expiring" || a.healthStatus === "expired"
        );
        setUnhealthyAccounts(unhealthy);
      } catch {
        // silently ignore
      }
    }
    void fetchHealth();
  }, []);

  if (dismissed || unhealthyAccounts.length === 0) return null;

  const hasExpired = unhealthyAccounts.some((a) => a.healthStatus === "expired");
  const count = unhealthyAccounts.length;

  return (
    <div
      className={`relative flex items-center gap-3 px-4 py-2 text-sm font-medium ${
        hasExpired
          ? "bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-300"
          : "bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
      }`}
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>
        {hasExpired
          ? `${count} social account${count > 1 ? "s have" : " has"} an expired connection.`
          : `${count} social account${count > 1 ? "s are" : " is"} expiring soon.`}{" "}
        <Link href="/accounts" className="underline underline-offset-2">
          Reconnect now
        </Link>
      </span>
      <button
        onClick={() => setDismissed(true)}
        className="ml-auto shrink-0 opacity-70 hover:opacity-100"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
