"use client";

import { useState, useEffect, useRef } from "react";
import { X, Plus, Tag } from "lucide-react";

interface TagOption {
  id: string;
  name: string;
  color: string;
}

interface TagSelectorProps {
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
}

const DEFAULT_COLOR = "#6366f1";
const PRESET_COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981",
  "#3b82f6", "#ef4444", "#8b5cf6", "#14b8a6",
];

export function TagSelector({ selectedTagIds, onChange }: TagSelectorProps) {
  const [tags, setTags] = useState<TagOption[]>([]);
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_COLOR);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/tags")
      .then((r) => r.json())
      .then((data: { tags?: TagOption[] }) => {
        if (data.tags) setTags(data.tags);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowCreate(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedTags = tags.filter((t) => selectedTagIds.includes(t.id));
  const unselectedTags = tags.filter((t) => !selectedTagIds.includes(t.id));

  function toggleTag(id: string) {
    if (selectedTagIds.includes(id)) {
      onChange(selectedTagIds.filter((tid) => tid !== id));
    } else {
      onChange([...selectedTagIds, id]);
    }
  }

  async function createTag() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, color: newColor }),
      });
      if (!res.ok) return;
      const tag = (await res.json()) as TagOption;
      setTags((prev) => [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)));
      onChange([...selectedTagIds, tag.id]);
      setNewName("");
      setNewColor(DEFAULT_COLOR);
      setShowCreate(false);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      {/* Selected chips */}
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {selectedTags.map((tag) => (
          <span
            key={tag.id}
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
            style={{ backgroundColor: tag.color }}
          >
            {tag.name}
            <button
              type="button"
              onClick={() => toggleTag(tag.id)}
              className="ml-0.5 rounded-full opacity-80 hover:opacity-100"
              aria-label={`Remove tag ${tag.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 rounded-full border border-dashed border-input px-2 py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors"
        >
          <Tag className="h-3 w-3" />
          Add tag
        </button>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-64 rounded-md border bg-popover shadow-md">
          {/* Existing unselected tags */}
          {unselectedTags.length > 0 && (
            <div className="p-1 max-h-48 overflow-y-auto">
              {unselectedTags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => { toggleTag(tag.id); setOpen(false); }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                >
                  <span
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: tag.color }}
                  />
                  {tag.name}
                </button>
              ))}
            </div>
          )}

          {unselectedTags.length > 0 && <div className="border-t" />}

          {/* Create new tag */}
          {!showCreate ? (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <Plus className="h-4 w-4" />
              Create new tag
            </button>
          ) : (
            <div className="p-3 flex flex-col gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); void createTag(); }
                  if (e.key === "Escape") setShowCreate(false);
                }}
                placeholder="Tag name…"
                className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                autoFocus
                maxLength={50}
              />
              <div className="flex flex-wrap gap-1.5">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    className={`h-5 w-5 rounded-full transition-transform ${newColor === c ? "scale-125 ring-2 ring-offset-1 ring-primary" : ""}`}
                    style={{ backgroundColor: c }}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void createTag()}
                  disabled={!newName.trim() || creating}
                  className="flex-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
                >
                  {creating ? "Creating…" : "Create"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
