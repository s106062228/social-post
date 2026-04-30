"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { APP_SHORTCUTS, matchesShortcut, isInputElement } from "@/lib/shortcuts";

/**
 * Registers global keyboard shortcuts that navigate or trigger top-level actions.
 * Must be rendered inside a client component tree (e.g. dashboard layout).
 */
export function GlobalShortcuts() {
  const router = useRouter();

  const newPostDef = APP_SHORTCUTS.find((s) => s.id === "new-post")!;
  const goPostsDef = APP_SHORTCUTS.find((s) => s.id === "go-posts")!;
  const goCalendarDef = APP_SHORTCUTS.find((s) => s.id === "go-calendar")!;
  const focusSearchDef = APP_SHORTCUTS.find((s) => s.id === "focus-search")!;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Skip when user is typing in a text field
      if (isInputElement(e.target)) return;

      if (matchesShortcut(e, newPostDef)) {
        e.preventDefault();
        router.push("/posts/new");
      } else if (matchesShortcut(e, goPostsDef)) {
        e.preventDefault();
        router.push("/posts");
      } else if (matchesShortcut(e, goCalendarDef)) {
        e.preventDefault();
        router.push("/calendar");
      } else if (matchesShortcut(e, focusSearchDef)) {
        e.preventDefault();
        router.push("/search");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, newPostDef, goPostsDef, goCalendarDef, focusSearchDef]);

  return null;
}
