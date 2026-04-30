"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { APP_SHORTCUTS, matchesShortcut, isInputElement } from "@/lib/shortcuts";

export function ShortcutHelp() {
  const [open, setOpen] = useState(false);

  const helpDef = APP_SHORTCUTS.find((s) => s.id === "show-shortcuts")!;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isInputElement(e.target)) return;
      if (matchesShortcut(e, helpDef)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [helpDef]);

  const byCategory = APP_SHORTCUTS.reduce<
    Record<string, typeof APP_SHORTCUTS>
  >((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {Object.entries(byCategory).map(([category, shortcuts]) => (
            <div key={category}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {category}
              </p>
              <div className="space-y-1.5">
                {shortcuts.map((s) => (
                  <div key={s.id} className="flex items-center justify-between">
                    <span className="text-sm">{s.description}</span>
                    <kbd className="rounded border bg-muted px-2 py-0.5 font-mono text-xs">
                      {s.label}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
