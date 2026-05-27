"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { RefreshCw, Copy, Check, Sparkles, ArrowRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface RefreshSuggestion {
  type: string;
  original?: string;
  updated: string;
  reason: string;
}

interface ContentRefreshDialogProps {
  postId: string;
  onApply?: (newContent: string) => void;
}

const TYPE_LABELS: Record<string, string> = {
  hashtag_update: "Hashtag Update",
  stat_refresh: "Stat Refresh",
  tone_modernize: "Tone Modernize",
  add_cta: "Add CTA",
  platform_optimize: "Platform Optimize",
};

const TYPE_COLORS: Record<string, string> = {
  hashtag_update: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  stat_refresh: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  tone_modernize: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  add_cta: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  platform_optimize: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300",
};

export function ContentRefreshDialog({ postId, onApply }: ContentRefreshDialogProps) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<RefreshSuggestion[]>([]);
  const [refreshedContent, setRefreshedContent] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleGenerate() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/posts/${postId}/suggest-refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Failed to generate refresh suggestions");
        }
        const data = (await res.json()) as {
          suggestions: RefreshSuggestion[];
          refreshedContent: string;
        };
        setSuggestions(data.suggestions);
        setRefreshedContent(data.refreshedContent);
      } catch (err) {
        toast({
          title: "Failed to generate refresh suggestions",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
      }
    });
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(refreshedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleApplyAsDraft() {
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: refreshedContent,
          mediaType: "NONE",
          status: "DRAFT",
        }),
      });
      if (!res.ok) throw new Error("Failed to create draft");
      toast({ title: "New draft created with refreshed content" });
      setOpen(false);
      onApply?.(refreshedContent);
    } catch {
      toast({ title: "Failed to create draft", variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs gap-1"
          title="AI Content Refresh"
        >
          <RefreshCw className="w-3 h-3" />
          Refresh
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-500" />
            AI Content Refresh
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {suggestions.length === 0 && !isPending && (
            <div className="text-center py-8 text-muted-foreground">
              <RefreshCw className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Click &quot;Generate Suggestions&quot; to get AI-powered ideas for refreshing this post.</p>
            </div>
          )}

          {isPending && (
            <div className="text-center py-8 text-muted-foreground">
              <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin opacity-40" />
              <p className="text-sm">Analyzing your post and generating refresh suggestions…</p>
            </div>
          )}

          {!isPending && suggestions.length > 0 && (
            <>
              <div>
                <h3 className="text-sm font-medium mb-2">Suggestions</h3>
                <div className="space-y-2">
                  {suggestions.map((s, i) => (
                    <div key={i} className="rounded-lg border p-3 space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[s.type] ?? "bg-gray-100 text-gray-800"}`}
                        >
                          {TYPE_LABELS[s.type] ?? s.type}
                        </span>
                      </div>
                      {s.original && (
                        <div className="flex items-start gap-1 text-xs text-muted-foreground">
                          <span className="line-through">{s.original}</span>
                          <ArrowRight className="w-3 h-3 shrink-0 mt-0.5" />
                          <span className="text-foreground">{s.updated}</span>
                        </div>
                      )}
                      {!s.original && (
                        <p className="text-xs">{s.updated}</p>
                      )}
                      <p className="text-xs text-muted-foreground">{s.reason}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium mb-2">Refreshed Content</h3>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-sm whitespace-pre-wrap">{refreshedContent}</p>
                </div>
                <div className="flex gap-2 mt-2">
                  <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1">
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                  <Button size="sm" onClick={handleApplyAsDraft} className="gap-1">
                    <RefreshCw className="w-3 h-3" />
                    Create as New Draft
                  </Button>
                </div>
              </div>
            </>
          )}

          <div className="flex justify-between items-center pt-2 border-t">
            <Button
              onClick={handleGenerate}
              disabled={isPending}
              className="gap-1"
              size="sm"
            >
              <Sparkles className="w-3 h-3" />
              {isPending ? "Generating…" : suggestions.length > 0 ? "Regenerate" : "Generate Suggestions"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
