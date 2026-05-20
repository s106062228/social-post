"use client";

import { useState } from "react";
import { SpellCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { GrammarSuggestionsDialog } from "@/components/grammar-suggestions-dialog";
import type { GrammarCheckResult } from "@/lib/ai";

interface GrammarCheckButtonProps {
  content: string;
  onApply: (newContent: string) => void;
}

export function GrammarCheckButton({ content, onApply }: GrammarCheckButtonProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GrammarCheckResult | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  async function handleCheck() {
    if (!content.trim()) {
      toast({ title: "No content to check", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/ai/grammar-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (res.status === 503) {
        toast({
          title: "AI not configured",
          description: "Grammar check requires an Anthropic API key.",
          variant: "destructive",
        });
        return;
      }

      if (!res.ok) {
        throw new Error("Request failed");
      }

      const data = (await res.json()) as GrammarCheckResult;
      setResult(data);
      setDialogOpen(true);
    } catch {
      toast({
        title: "Grammar check failed",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  function handleApplySuggestion(original: string, replacement: string) {
    const updated = content.replace(original, replacement);
    onApply(updated);
    toast({ title: "Suggestion applied" });
  }

  function handleApplyAll(corrected: string) {
    onApply(corrected);
    toast({ title: "All corrections applied" });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void handleCheck()}
        disabled={loading || !content.trim()}
        className="gap-1.5"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <SpellCheck className="h-3.5 w-3.5" />
        )}
        {loading ? "Checking…" : "Grammar Check"}
      </Button>

      {result && (
        <GrammarSuggestionsDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          result={result}
          onApplyAll={handleApplyAll}
          onApplySuggestion={handleApplySuggestion}
        />
      )}
    </>
  );
}
