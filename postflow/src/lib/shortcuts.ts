export interface ShortcutDefinition {
  id: string;
  key: string;
  modifiers: ReadonlyArray<"meta" | "shift" | "alt">;
  label: string;
  description: string;
  category: string;
}

export const APP_SHORTCUTS: ShortcutDefinition[] = [
  {
    id: "command-palette",
    key: "k",
    modifiers: ["meta"],
    label: "⌘K / Ctrl+K",
    description: "Open command palette",
    category: "Global",
  },
  {
    id: "new-post",
    key: "n",
    modifiers: [],
    label: "N",
    description: "New post",
    category: "Posts",
  },
  {
    id: "show-shortcuts",
    key: "?",
    modifiers: [],
    label: "?",
    description: "Show keyboard shortcuts",
    category: "Global",
  },
  {
    id: "go-posts",
    key: "p",
    modifiers: ["meta", "shift"],
    label: "⌘⇧P / Ctrl+Shift+P",
    description: "Go to Posts",
    category: "Navigation",
  },
  {
    id: "go-calendar",
    key: "c",
    modifiers: ["meta", "shift"],
    label: "⌘⇧C / Ctrl+Shift+C",
    description: "Go to Calendar",
    category: "Navigation",
  },
];

/**
 * Returns true when the KeyboardEvent matches the given shortcut definition.
 * The 'meta' modifier is satisfied by either metaKey (Mac ⌘) or ctrlKey (Win/Linux).
 */
export function matchesShortcut(
  event: KeyboardEvent,
  def: ShortcutDefinition
): boolean {
  if (event.key.toLowerCase() !== def.key.toLowerCase()) return false;

  const needsMeta = def.modifiers.includes("meta");
  const hasMetaOrCtrl = event.metaKey || event.ctrlKey;
  if (needsMeta !== hasMetaOrCtrl) return false;

  const needsShift = def.modifiers.includes("shift");
  if (needsShift !== event.shiftKey) return false;

  const needsAlt = def.modifiers.includes("alt");
  if (needsAlt !== event.altKey) return false;

  return true;
}

/** Returns true when the event target is a focusable text-entry element. */
export function isInputElement(target: EventTarget | null): boolean {
  if (!target) return false;
  const el = target as HTMLElement;
  const tag = el.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea" || el.isContentEditable === true;
}
