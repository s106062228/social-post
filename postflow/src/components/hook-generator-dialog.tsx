"use client";

import { useState } from "react";
import {
  Loader2,
  Copy,
  Check,
  RefreshCw,
  Zap,
  ChevronRight,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import type { Platform } from "@prisma/client";
import type { HookOption } from "@/lib/ai";

const STYLE_LABELS: Record<HookOption["style"], { label: string; color: string }> = {
  question:    { label: "Question",     color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  statistic:   { label: "Statistic",    color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  story:       { label: "Story",        color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
  controversy: { label: "Controversy",  color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  curiosity:   { label: "Curiosity",    color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300" },
  list:        { label: "List",         color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
};

interface HookGeneratorDialogProps {
  open: boolean;
  onClose: () => void;
  content: string;
  platforms: Platform[];
  onPrependHook: (hook: string) => void;
}

export function HookGeneratorDialog({
  open,
  onClose,
  content,
  platforms,
  onPrependHook,
}: HookGeneratorDialogProps) {
  const [hooks, setHooks] = useState<HookOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [generated, setGenerated] = useState(false);

  async function fetchHooks() {
    if (!content.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ai/generate-hooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.trim(),
          platforms: platforms.length > 0 ? platforms : ["FACEBOOK"],
          count: 5,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        if (res.status === 503) {
          toast({
            title: "AI not configured",
            description: "ANTHROPIC_API_KEY is not set.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Failed to generate hooks",
            description: data.error,
            variant: "destructive",
          });
        }
        return;
      }
      const data = (await res.json()) as { hooks: HookOption[] };
      setHooks(data.hooks);
      setGenerated(true);
    } catch {
      toast({
        title: "Error",
        description: "Failed to generate hooks.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy(index: number, text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  }

  function handlePrepend(hook: string) {
    onPrependHook(hook);
    onClose();
    toast({
      title: "Hook applied",
      description: "Added as opening line of your post.",
    });
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      onClose();
      if (!loading) {
        setHooks([]);
        setGenerated(false);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Hook Generator
          </DialogTitle>
          <DialogDescription>
            Generate attention-grabbing opening lines that stop the scroll.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Content preview */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">
              Post content
            </p>
            <div className="rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground line-clamp-3">
              {content.trim() || (
                <span className="italic">No content yet</span>
              )}
            </div>
          </div>

          {/* Generate / Regenerate button */}
          {!generated ? (
            <Button
              onClick={() => void fetchHooks()}
              disabled={loading || !content.trim()}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating hooks…
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Generate Hooks
                </>
              )}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchHooks()}
              disabled={loading}
              className="w-full"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              Regenerate
            </Button>
          )}

          {/* Hooks list */}
          {hooks.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Suggested hooks</p>
              {hooks.map((h, i) => {
                const style = STYLE_LABELS[h.style] ?? STYLE_LABELS.curiosity;
                return (
                  <div
                    key={i}
                    className="group rounded-md border bg-card p-3 text-sm hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${style.color}`}
                      >
                        {style.label}
                      </span>
                      <span className="flex-1 leading-snug font-medium">
                        {h.hook}
                      </span>
                      <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => void handleCopy(i, h.hook)}
                          className="rounded p-1 hover:bg-muted transition-colors"
                          title="Copy hook"
                        >
                          {copiedIndex === i ? (
                            <Check className="h-3.5 w-3.5 text-green-600" />
                          ) : (
                            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePrepend(h.hook)}
                          className="rounded p-1 hover:bg-muted transition-colors"
                          title="Prepend to post"
                        >
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      </div>
                    </div>
                    {h.explanation && (
                      <p className="mt-1 text-xs text-muted-foreground pl-0">
                        {h.explanation}
                      </p>
                    )}
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground">
                Click{" "}
                <ChevronRight className="h-3 w-3 inline" /> to prepend hook as
                the opening line of your post.
              </p>
            </div>
          )}

          {generated && hooks.length === 0 && !loading && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No hooks generated. Try regenerating.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
