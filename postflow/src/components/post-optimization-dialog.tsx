"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Copy,
  Check,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import type { PostOptimizationResult, OptimizationChange } from "@/lib/ai";

const CHANGE_TYPE_LABELS: Record<OptimizationChange["type"], string> = {
  grammar: "Grammar",
  hashtags: "Hashtags",
  engagement: "Engagement",
  platform: "Platform",
  clarity: "Clarity",
};

const CHANGE_TYPE_COLORS: Record<OptimizationChange["type"], string> = {
  grammar: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  hashtags: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  engagement: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  platform: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400",
  clarity: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 60
      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
      : score >= 30
      ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
      : "bg-muted text-muted-foreground";
  return (
    <span
      className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color}`}
    >
      +{score} improvement
    </span>
  );
}

interface PostOptimizationDialogProps {
  open: boolean;
  onClose: () => void;
  originalContent: string;
  platforms: string[];
  result: PostOptimizationResult;
  onApply: (optimizedContent: string) => void;
  onRegenerate: () => void;
  isRegenerating: boolean;
}

export function PostOptimizationDialog({
  open,
  onClose,
  originalContent,
  result,
  onApply,
  onRegenerate,
  isRegenerating,
}: PostOptimizationDialogProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(result.optimizedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleApply() {
    onApply(result.optimizedContent);
    toast({ title: "Content optimized", description: "Post content has been updated." });
    onClose();
  }

  const hasChanges = result.changes.length > 0;
  const contentChanged = result.optimizedContent !== originalContent;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <Sparkles className="h-4 w-4 text-amber-500" />
            AI Post Optimization
            {hasChanges && <ScoreBadge score={result.estimatedImprovementScore} />}
            {!hasChanges && (
              <Badge className="ml-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-0">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Already optimal
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Side-by-side comparison */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
                Original
              </p>
              <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap min-h-[100px] text-muted-foreground">
                {originalContent}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
                Optimized
              </p>
              <div className="relative rounded-md border bg-card p-3 text-sm whitespace-pre-wrap min-h-[100px]">
                {result.optimizedContent}
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  className="absolute top-2 right-2 rounded p-1 hover:bg-muted transition-colors"
                  title="Copy optimized content"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Changes made */}
          {hasChanges && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">
                Changes made
              </p>
              <ul className="space-y-1.5">
                {result.changes.map((change, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span
                      className={`mt-0.5 flex-shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${
                        CHANGE_TYPE_COLORS[change.type] ?? "bg-muted text-muted-foreground"
                      }`}
                    >
                      {CHANGE_TYPE_LABELS[change.type] ?? change.type}
                    </span>
                    <span className="text-muted-foreground">{change.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Hashtags added */}
          {result.hashtagsAdded.length > 0 && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">
                Hashtags added
              </p>
              <div className="flex flex-wrap gap-1.5">
                {result.hashtagsAdded.map((tag, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-800 dark:bg-purple-900/30 dark:text-purple-400"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRegenerate}
            disabled={isRegenerating}
            className="gap-1.5"
          >
            {isRegenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Regenerate
          </Button>
          <div className="flex gap-2 sm:ml-auto">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleApply} disabled={!contentChanged}>
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              Apply Optimization
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
