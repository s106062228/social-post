"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface LockState {
  isAcquired: boolean;
  isAcquiring: boolean;
  error: string | null;
  expiresAt: string | null;
}

const KEEPALIVE_INTERVAL_MS = 5 * 60 * 1000; // refresh every 5 min (lock lasts 15 min)

export function usePostLock(postId: string | null) {
  const [state, setState] = useState<LockState>({
    isAcquired: false,
    isAcquiring: false,
    error: null,
    expiresAt: null,
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const acquiredRef = useRef(false);

  const acquire = useCallback(async () => {
    if (!postId) return;
    setState((s) => ({ ...s, isAcquiring: true, error: null }));
    try {
      const res = await fetch(`/api/posts/${postId}/lock`, { method: "POST" });
      if (res.ok) {
        const data = (await res.json()) as { locked: boolean; expiresAt?: string };
        acquiredRef.current = true;
        setState({ isAcquired: true, isAcquiring: false, error: null, expiresAt: data.expiresAt ?? null });
      } else if (res.status === 409) {
        const data = (await res.json()) as { error: string };
        setState({ isAcquired: false, isAcquiring: false, error: data.error, expiresAt: null });
      } else {
        setState({ isAcquired: false, isAcquiring: false, error: "Failed to acquire lock", expiresAt: null });
      }
    } catch {
      setState({ isAcquired: false, isAcquiring: false, error: "Network error", expiresAt: null });
    }
  }, [postId]);

  const release = useCallback(async () => {
    if (!postId || !acquiredRef.current) return;
    acquiredRef.current = false;
    setState({ isAcquired: false, isAcquiring: false, error: null, expiresAt: null });
    await fetch(`/api/posts/${postId}/lock`, { method: "DELETE" }).catch(() => {});
  }, [postId]);

  useEffect(() => {
    if (!postId) return;

    void acquire();

    intervalRef.current = setInterval(() => {
      if (acquiredRef.current) void acquire();
    }, KEEPALIVE_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      void release();
    };
  }, [postId, acquire, release]);

  return { ...state, release };
}
