"use client";

import { useEffect, useState, useCallback } from "react";

export type ToastVariant = "default" | "success" | "destructive";

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

type Subscriber = (toasts: ToastItem[]) => void;

let _toasts: ToastItem[] = [];
let _counter = 0;
const _subscribers = new Set<Subscriber>();

function _notify() {
  _subscribers.forEach((s) => s([..._toasts]));
}

export function toast(opts: Omit<ToastItem, "id">) {
  const id = String(++_counter);
  const duration = opts.duration ?? 4000;
  _toasts = [..._toasts, { id, ...opts }];
  _notify();
  setTimeout(() => {
    _toasts = _toasts.filter((t) => t.id !== id);
    _notify();
  }, duration);
  return id;
}

export function dismissToast(id: string) {
  _toasts = _toasts.filter((t) => t.id !== id);
  _notify();
}

export function useToast() {
  const [items, setItems] = useState<ToastItem[]>(_toasts);

  useEffect(() => {
    const sub: Subscriber = (updated) => setItems(updated);
    _subscribers.add(sub);
    return () => {
      _subscribers.delete(sub);
    };
  }, []);

  const dismiss = useCallback((id: string) => dismissToast(id), []);

  return { toasts: items, dismiss };
}
