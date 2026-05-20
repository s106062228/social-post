"use client";

import { useState } from "react";
import { CheckCircle2, ArrowRight, Copy, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { GrammarCheckResult } from "@/lib/ai";

interface GrammarSuggestionsDialogProps {
  open: boolean;
  onClose: () => void;
  result: GrammarCheckResult;
  onApplyAll: (correctedContent: string) => void;
  onApplySuggestion: (original: string, replacement: string) => void;
}

export function GrammarSuggestionsDialog({
  open,
  onClose,
  result,
  onApplyAll,
  onApplySuggestion,
}: GrammarSuggestionsDialogProps) {
  const [copied, setCopied] = useState(false);
  const [appliedIndexes, setAppliedIndexes] = useState<Set<number>>(new Set());

  function handleApplyAll() {
    onApplyAll(result.correctedContent);
    onClose();
  }

  function handleApplySuggestion(index: number, original: string, replacement: string) {
    onApplySuggestion(original, replacement);
    setAppliedIndexes((prev) => new Set([...prev, index]));
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(result.correctedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const hasIssues = result.suggestions.length > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Grammar &amp; Spelling Check
            {hasIssues ? (
              <Badge variant="destructive" className="ml-1">
                {result.issueCount} {result.issueCount === 1 ? "issue" : "issues"}
              </Badge>
            ) : (
              <Badge className="ml-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-0">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                No issues
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Corrected content preview */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1.5">
              Corrected content
            </p>
            <div className="relative rounded-md border bg-muted/50 p-3 text-sm whitespace-pre-wrap">
              {result.correctedContent}
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="absolute top-2 right-2 rounded p-1 hover:bg-muted transition-colors"
                title="Copy corrected content"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
            </div>
          </div>

          {/* Individual suggestions */}
          {hasIssues && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">
                Suggestions
              </p>
              <ul className="space-y-2">
                {result.suggestions.map((s, i) => (
                  <li
                    key={i}
                    className={`rounded-md border p-3 text-sm ${
                      appliedIndexes.has(i)
                        ? "border-green-200 bg-green-50 dark:border-green-900/30 dark:bg-green-900/10"
                        : "bg-card"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="line-through text-red-600 dark:text-red-400 font-mono">
                            {s.original}
                          </span>
                          <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                          <span className="text-green-700 dark:text-green-400 font-mono font-medium">
                            {s.replacement}
                          </span>
                        </div>
                        <p className="mt-1 text-muted-foreground text-xs">
                          {s.explanation}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant={appliedIndexes.has(i) ? "secondary" : "outline"}
                        className="flex-shrink-0 h-7 px-2 text-xs"
                        onClick={() =>
                          handleApplySuggestion(i, s.original, s.replacement)
                        }
                        disabled={appliedIndexes.has(i)}
                      >
                        {appliedIndexes.has(i) ? (
                          <>
                            <Check className="h-3 w-3 mr-1" />
                            Applied
                          </>
                        ) : (
                          "Apply"
                        )}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {hasIssues && (
            <Button onClick={handleApplyAll}>
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              Apply All Corrections
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
