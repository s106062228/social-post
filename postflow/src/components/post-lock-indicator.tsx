"use client";

import { useEffect, useState } from "react";
import { Lock } from "lucide-react";

interface LockStatus {
  locked: boolean;
  lockedBy?: { id: string; name: string | null; email: string };
  expiresAt?: string;
}

interface PostLockIndicatorProps {
  postId: string;
  currentUserId: string;
  pollingIntervalMs?: number;
}

function timeRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const mins = Math.ceil(ms / 60000);
  return `${mins}m`;
}

export function PostLockIndicator({
  postId,
  currentUserId,
  pollingIntervalMs = 30_000,
}: PostLockIndicatorProps) {
  const [status, setStatus] = useState<LockStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchLock() {
      try {
        const res = await fetch(`/api/posts/${postId}/lock`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as LockStatus;
        if (!cancelled) setStatus(data);
      } catch {
        // silently ignore network errors
      }
    }

    void fetchLock();
    const interval = setInterval(() => void fetchLock(), pollingIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [postId, pollingIntervalMs]);

  if (!status?.locked) return null;
  if (status.lockedBy?.id === currentUserId) return null;

  const displayName = status.lockedBy?.name ?? status.lockedBy?.email ?? "Someone";
  const remaining = status.expiresAt ? timeRemaining(status.expiresAt) : "";

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
      title={`Locked by ${displayName}${remaining ? ` — expires in ${remaining}` : ""}`}
    >
      <Lock className="h-3 w-3" aria-hidden />
      {displayName}
      {remaining && <span className="opacity-70">·{remaining}</span>}
    </span>
  );
}
