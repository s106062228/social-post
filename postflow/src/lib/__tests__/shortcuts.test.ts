import {
  matchesShortcut,
  isInputElement,
  APP_SHORTCUTS,
  type ShortcutDefinition,
} from "@/lib/shortcuts";

function makeEvent(
  key: string,
  opts: {
    metaKey?: boolean;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
  } = {}
): KeyboardEvent {
  return {
    key,
    metaKey: opts.metaKey ?? false,
    ctrlKey: opts.ctrlKey ?? false,
    shiftKey: opts.shiftKey ?? false,
    altKey: opts.altKey ?? false,
  } as KeyboardEvent;
}

const newPostDef = APP_SHORTCUTS.find((s) => s.id === "new-post")!;
const paletteDef = APP_SHORTCUTS.find((s) => s.id === "command-palette")!;

describe("matchesShortcut", () => {
  it("matches a simple key with no modifiers", () => {
    expect(matchesShortcut(makeEvent("n"), newPostDef)).toBe(true);
  });

  it("does not match when the key is wrong", () => {
    expect(matchesShortcut(makeEvent("m"), newPostDef)).toBe(false);
  });

  it("does not match when an unexpected modifier is pressed", () => {
    expect(matchesShortcut(makeEvent("n", { metaKey: true }), newPostDef)).toBe(
      false
    );
  });

  it("matches a meta shortcut when metaKey is pressed (Mac)", () => {
    expect(matchesShortcut(makeEvent("k", { metaKey: true }), paletteDef)).toBe(
      true
    );
  });

  it("matches a meta shortcut when ctrlKey is pressed (cross-platform)", () => {
    expect(matchesShortcut(makeEvent("k", { ctrlKey: true }), paletteDef)).toBe(
      true
    );
  });

  it("does not match a meta shortcut without any modifier", () => {
    expect(matchesShortcut(makeEvent("k"), paletteDef)).toBe(false);
  });

  it("is case-insensitive for the key character", () => {
    expect(matchesShortcut(makeEvent("N"), newPostDef)).toBe(true);
  });

  it("requires shift modifier when specified", () => {
    const shiftDef: ShortcutDefinition = {
      id: "test-shift",
      key: "s",
      modifiers: ["shift"],
      label: "Shift+S",
      description: "Test",
      category: "Test",
    };
    expect(matchesShortcut(makeEvent("s"), shiftDef)).toBe(false);
    expect(matchesShortcut(makeEvent("s", { shiftKey: true }), shiftDef)).toBe(
      true
    );
  });

  it("requires alt modifier when specified", () => {
    const altDef: ShortcutDefinition = {
      id: "test-alt",
      key: "a",
      modifiers: ["alt"],
      label: "Alt+A",
      description: "Test",
      category: "Test",
    };
    expect(matchesShortcut(makeEvent("a"), altDef)).toBe(false);
    expect(matchesShortcut(makeEvent("a", { altKey: true }), altDef)).toBe(
      true
    );
  });

  it("rejects a key with extra modifiers when none are required", () => {
    expect(matchesShortcut(makeEvent("n", { shiftKey: true }), newPostDef)).toBe(
      false
    );
  });
});

describe("APP_SHORTCUTS", () => {
  it("has unique ids", () => {
    const ids = APP_SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes the command-palette shortcut", () => {
    expect(APP_SHORTCUTS.some((s) => s.id === "command-palette")).toBe(true);
  });

  it("includes the new-post shortcut", () => {
    expect(APP_SHORTCUTS.some((s) => s.id === "new-post")).toBe(true);
  });

  it("includes the show-shortcuts shortcut", () => {
    expect(APP_SHORTCUTS.some((s) => s.id === "show-shortcuts")).toBe(true);
  });
});

describe("isInputElement", () => {
  it("returns false for null", () => {
    expect(isInputElement(null)).toBe(false);
  });

  it("returns true for an input element", () => {
    const el = { tagName: "INPUT", isContentEditable: false } as unknown as HTMLElement;
    expect(isInputElement(el)).toBe(true);
  });

  it("returns true for a textarea element", () => {
    const el = { tagName: "TEXTAREA", isContentEditable: false } as unknown as HTMLElement;
    expect(isInputElement(el)).toBe(true);
  });

  it("returns true for a contentEditable div", () => {
    const el = { tagName: "DIV", isContentEditable: true } as unknown as HTMLElement;
    expect(isInputElement(el)).toBe(true);
  });

  it("returns false for a regular div", () => {
    const el = { tagName: "DIV", isContentEditable: false } as unknown as HTMLElement;
    expect(isInputElement(el)).toBe(false);
  });
});
