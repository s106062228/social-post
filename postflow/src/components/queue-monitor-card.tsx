"use client";

import { useEffect, useState, useCallback } from "react";
import type { QueueStatusResponse } from "@/app/api/queue/status/route";

interface StatBoxProps {
  label: string;
  value: number;
  colorClass: string;
}

function StatBox({ label, value, colorClass }: StatBoxProps) {
  return (
    <div className={`rounded-lg border p-3 text-center ${colorClass}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

export function QueueMonitorCard() {
  const [status, setStatus] = useState<QueueStatusResponse | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/queue/status");
      if (!res.ok) {
        setUnavailable(true);
        return;
      }
      const data: QueueStatusResponse = await res.json();
      setStatus(data);
      setUnavailable(false);
    } catch {
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 15_000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  if (loading) {
    return (
      <div className="rounded-xl border bg-card p-4">
        <div className="h-4 w-32 bg-muted animate-pulse rounded mb-3" />
        <div className="grid grid-cols-3 gap-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (unavailable) {
    return (
      <div className="rounded-xl border bg-card p-4">
        <h3 className="font-semibold text-sm mb-1">Publish Queue</h3>
        <p className="text-sm text-muted-foreground">Queue unavailable — Redis may be unreachable.</p>
      </div>
    );
  }

  const s = status!;

  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="font-semibold text-sm mb-3">Publish Queue</h3>
      <div className="grid grid-cols-3 gap-2">
        <StatBox label="Waiting" value={s.waiting} colorClass="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800" />
        <StatBox label="Active" value={s.active} colorClass="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800" />
        <StatBox label="Delayed" value={s.delayed} colorClass="bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800" />
        <StatBox label="Failed" value={s.failed} colorClass="bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800" />
        <StatBox label="Completed" value={s.completed} colorClass="bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700" />
        <StatBox label="Paused" value={s.paused} colorClass="bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700" />
      </div>
    </div>
  );
}
