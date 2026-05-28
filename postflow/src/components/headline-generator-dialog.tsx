"use client";

import { useState } from "react";
import { Loader2, Copy, Check, RefreshCw, Type, ChevronRight } from "lucide-react";
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

interface HeadlineGeneratorDialogProps {
  open: boolean;
  onClose: () => void;
  content: string;
  platforms: Platform[];
  onUseAsFirstLine: (headline: string) => void;
}

export function HeadlineGeneratorDialog({
  open,
  onClose,
  content,
  platforms,
  onUseAsFirstLine,
}: HeadlineGeneratorDialogProps) {
  const [headlines, setHeadlines] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [generated, setGenerated] = useState(false);

  async function fetchHeadlines() {
    if (!content.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ai/headlines", {
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
          toast({ title: "AI not configured", description: "ANTHROPIC_API_KEY is not set.", variant: "destructive" });
        } else {
          toast({ title: "Failed to generate headlines", description: data.error, variant: "destructive" });
        }
        return;
      }
      const data = (await res.json()) as { headlines: string[] };
      setHeadlines(data.headlines);
      setGenerated(true);
    } catch {
      toast({ title: "Error", description: "Failed to generate headlines.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy(index: number, text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  }

  function handleUseAsFirstLine(headline: string) {
    onUseAsFirstLine(headline);
    onClose();
    toast({ title: "Headline applied", description: "Added as first line of post content." });
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      onClose();
      if (!loading) {
        setHeadlines([]);
        setGenerated(false);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Type className="h-4 w-4" />
            Headline Generator
          </DialogTitle>
          <DialogDescription>
            Generate compelling titles and headlines for your post content using AI.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Content preview */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Post content</p>
            <div className="rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground line-clamp-3">
              {content.trim() || <span className="italic">No content yet</span>}
            </div>
          </div>

          {/* Generate button */}
          {!generated ? (
            <Button
              onClick={() => void fetchHeadlines()}
              disabled={loading || !content.trim()}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating headlines…
                </>
              ) : (
                <>
                  <Type className="h-4 w-4 mr-2" />
                  Generate Headlines
                </>
              )}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchHeadlines()}
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

          {/* Headlines list */}
          {headlines.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Suggested headlines</p>
              {headlines.map((headline, i) => (
                <div
                  key={i}
                  className="group flex items-start gap-2 rounded-md border bg-card p-3 text-sm hover:bg-muted/50 transition-colors"
                >
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <span className="flex-1 leading-snug">{headline}</span>
                  <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => void handleCopy(i, headline)}
                      className="rounded p-1 hover:bg-muted transition-colors"
                      title="Copy headline"
                    >
                      {copiedIndex === i ? (
                        <Check className="h-3.5 w-3.5 text-green-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUseAsFirstLine(headline)}
                      className="rounded p-1 hover:bg-muted transition-colors"
                      title="Use as first line of post"
                    >
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Click <ChevronRight className="h-3 w-3 inline" /> to prepend headline as first line of your post.
              </p>
            </div>
          )}

          {generated && headlines.length === 0 && !loading && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No headlines generated. Try regenerating.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
