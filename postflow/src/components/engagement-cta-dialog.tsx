"use client";

import { useState } from "react";
import {
  Loader2,
  Copy,
  Check,
  RefreshCw,
  Target,
  ArrowUp,
  ArrowDown,
  Minus,
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

interface EngagementCTA {
  text: string;
  type: string;
  platform?: string;
  engagementBoost: "low" | "medium" | "high";
  explanation: string;
}

interface EngagementCTAResult {
  ctas: EngagementCTA[];
  hook: string;
}

const CTA_TYPES = [
  { key: "general", label: "All" },
  { key: "question", label: "Question" },
  { key: "challenge", label: "Challenge" },
  { key: "poll", label: "Poll" },
  { key: "share", label: "Share" },
  { key: "comment", label: "Comment" },
  { key: "save", label: "Save" },
  { key: "follow", label: "Follow" },
];

const BOOST_CONFIG: Record<
  "low" | "medium" | "high",
  { label: string; className: string; Icon: React.ElementType }
> = {
  low: { label: "Low boost", className: "text-muted-foreground bg-muted", Icon: Minus },
  medium: { label: "Medium boost", className: "text-yellow-700 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-950", Icon: ArrowUp },
  high: { label: "High boost", className: "text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-950", Icon: ArrowUp },
};

interface EngagementCTADialogProps {
  open: boolean;
  onClose: () => void;
  content: string;
  platforms: string[];
  onAppendCTA: (cta: string) => void;
  onPrependHook: (hook: string) => void;
}

export function EngagementCTADialog({
  open,
  onClose,
  content,
  platforms,
  onAppendCTA,
  onPrependHook,
}: EngagementCTADialogProps) {
  const [selectedType, setSelectedType] = useState("general");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EngagementCTAResult | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [hookCopied, setHookCopied] = useState(false);

  async function fetchCTAs(ctaType: string) {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/ai/engagement-ctas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          platforms,
          ctaType: ctaType === "general" ? undefined : ctaType,
        }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "Failed to generate CTAs");
      }
      const data = (await res.json()) as EngagementCTAResult;
      setResult(data);
    } catch (err) {
      toast({
        title: "CTA generation failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  function handleTypeSelect(type: string) {
    setSelectedType(type);
    void fetchCTAs(type);
  }

  function handleAppend(cta: EngagementCTA) {
    onAppendCTA(cta.text);
    toast({ title: "CTA added", description: "Appended to post content." });
    handleClose();
  }

  function handlePrependHook() {
    if (!result?.hook) return;
    onPrependHook(result.hook);
    toast({ title: "Hook added", description: "Prepended to post content." });
    handleClose();
  }

  async function handleCopyCTA(text: string, idx: number) {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 1500);
  }

  async function handleCopyHook() {
    if (!result?.hook) return;
    await navigator.clipboard.writeText(result.hook);
    setHookCopied(true);
    setTimeout(() => setHookCopied(false), 1500);
  }

  function handleClose() {
    setResult(null);
    setSelectedType("general");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-orange-500" />
            Engagement CTAs & Hook Generator
          </DialogTitle>
          <DialogDescription>
            Generate compelling calls-to-action and an attention-grabbing opening hook for your post.
          </DialogDescription>
        </DialogHeader>

        {/* CTA type filter */}
        <div className="flex flex-wrap gap-1.5">
          {CTA_TYPES.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => handleTypeSelect(key)}
              disabled={loading}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${
                selectedType === key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-background hover:bg-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Generating CTAs…</span>
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <div className="space-y-4">
            {/* Best Hook */}
            {result.hook && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                    ✨ Best Opening Hook
                  </p>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => void handleCopyHook()}
                    >
                      {hookCopied ? (
                        <Check className="h-3 w-3 mr-1" />
                      ) : (
                        <Copy className="h-3 w-3 mr-1" />
                      )}
                      Copy
                    </Button>
                    <Button
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={handlePrependHook}
                    >
                      <ArrowDown className="h-3 w-3 mr-1" />
                      Prepend
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-amber-900 dark:text-amber-100">{result.hook}</p>
              </div>
            )}

            {/* CTA list */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Calls-to-Action ({result.ctas.length})
              </p>
              {result.ctas.map((cta, idx) => {
                const boost = BOOST_CONFIG[cta.engagementBoost];
                const BoostIcon = boost.Icon;
                return (
                  <div key={idx} className="rounded-lg border bg-background p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm flex-1">{cta.text}</p>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => void handleCopyCTA(cta.text, idx)}
                        >
                          {copiedIndex === idx ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => handleAppend(cta)}
                        >
                          Append
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium ${boost.className}`}>
                        <BoostIcon className="h-3 w-3" />
                        {boost.label}
                      </span>
                      <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground capitalize">
                        {cta.type}
                      </span>
                      {cta.platform && (
                        <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                          {cta.platform}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{cta.explanation}</p>
                  </div>
                );
              })}
            </div>

            {/* Regenerate */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void fetchCTAs(selectedType)}
              disabled={loading}
              className="w-full"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Regenerate
            </Button>
          </div>
        )}

        {/* Prompt when nothing loaded */}
        {!loading && !result && (
          <p className="text-xs text-muted-foreground text-center py-2">
            Select a CTA type above to generate engagement prompts for your post.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
