"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, GripVertical, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ThreadItem {
  id: string;
  content: string;
  mediaUrls: string[];
}

interface ThreadBuilderProps {
  items: ThreadItem[];
  onChange: (items: ThreadItem[]) => void;
  maxItems?: number;
  charLimit?: number;
  className?: string;
}

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

export function ThreadBuilder({
  items,
  onChange,
  maxItems = 25,
  charLimit = 280,
  className,
}: ThreadBuilderProps) {
  const [collapsed, setCollapsed] = useState(false);

  const addItem = useCallback(() => {
    if (items.length >= maxItems) return;
    onChange([...items, { id: generateId(), content: "", mediaUrls: [] }]);
  }, [items, maxItems, onChange]);

  const removeItem = useCallback(
    (id: string) => {
      onChange(items.filter((item) => item.id !== id));
    },
    [items, onChange]
  );

  const updateContent = useCallback(
    (id: string, content: string) => {
      onChange(items.map((item) => (item.id === id ? { ...item, content } : item)));
    },
    [items, onChange]
  );

  const moveUp = useCallback(
    (index: number) => {
      if (index === 0) return;
      const next = [...items];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      onChange(next);
    },
    [items, onChange]
  );

  const moveDown = useCallback(
    (index: number) => {
      if (index === items.length - 1) return;
      const next = [...items];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      onChange(next);
    },
    [items, onChange]
  );

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary"
        >
          {collapsed ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5" />
          )}
          Thread ({items.length} {items.length === 1 ? "item" : "items"})
        </button>
        {!collapsed && items.length < maxItems && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addItem}
            className="h-7 gap-1 text-xs"
          >
            <Plus className="h-3 w-3" />
            Add tweet
          </Button>
        )}
      </div>

      {!collapsed && (
        <div className="space-y-3">
          {items.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              No thread items yet.{" "}
              <button
                type="button"
                className="text-primary underline-offset-2 hover:underline"
                onClick={addItem}
              >
                Add a tweet
              </button>{" "}
              to build a thread.
            </div>
          ) : (
            items.map((item, index) => {
              const charCount = item.content.length;
              const isOverLimit = charCount > charLimit;
              const isNearLimit = charCount > charLimit * 0.9;

              return (
                <div
                  key={item.id}
                  className="relative flex gap-2 rounded-md border bg-card p-3"
                >
                  {/* Order indicator */}
                  <div className="flex flex-col items-center gap-1 pt-1">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                      {index + 1}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        onClick={() => moveUp(index)}
                        disabled={index === 0}
                        className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                        title="Move up"
                      >
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveDown(index)}
                        disabled={index === items.length - 1}
                        className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                        title="Move down"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </div>
                    <GripVertical className="h-3 w-3 text-muted-foreground/40" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 space-y-1.5">
                    <Textarea
                      value={item.content}
                      onChange={(e) => updateContent(item.id, e.target.value)}
                      placeholder={`Tweet ${index + 1}…`}
                      rows={3}
                      className="resize-none text-sm"
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        Tweet {index + 1} of {items.length}
                      </span>
                      <span
                        className={cn(
                          "text-xs tabular-nums",
                          isOverLimit
                            ? "font-semibold text-destructive"
                            : isNearLimit
                              ? "text-yellow-600 dark:text-yellow-400"
                              : "text-muted-foreground"
                        )}
                      >
                        {charCount}/{charLimit}
                      </span>
                    </div>
                  </div>

                  {/* Delete */}
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title="Remove tweet"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
