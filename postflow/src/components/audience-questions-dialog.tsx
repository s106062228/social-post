"use client";

import { useState } from "react";
import {
  Loader2,
  Copy,
  Check,
  RefreshCw,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import type { AudienceQuestion, AudienceQuestionsResult } from "@/lib/ai";

const CATEGORY_LABELS: Record<AudienceQuestion["category"], string> = {
  "how-to": "How-To",
  why: "Why",
  what: "What",
  comparison: "Comparison",
  misconception: "Misconception",
  tip: "Tip",
};

const CATEGORY_COLORS: Record<AudienceQuestion["category"], string> = {
  "how-to": "bg-blue-100 text-blue-700",
  why: "bg-purple-100 text-purple-700",
  what: "bg-slate-100 text-slate-700",
  comparison: "bg-amber-100 text-amber-700",
  misconception: "bg-red-100 text-red-700",
  tip: "bg-green-100 text-green-700",
};

interface AudienceQuestionsDialogProps {
  open: boolean;
  onClose: () => void;
  platforms: string[];
  onApply: (post: string) => void;
}

export function AudienceQuestionsDialog({
  open,
  onClose,
  platforms,
  onApply,
}: AudienceQuestionsDialogProps) {
  const [topic, setTopic] = useState("");
  const [context, setContext] = useState("");
  const [count, setCount] = useState(5);
  const [result, setResult] = useState<AudienceQuestionsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const activePlatforms = platforms.length > 0 ? platforms : ["FACEBOOK", "INSTAGRAM", "TWITTER"];

  async function generate() {
    if (!topic.trim()) {
      toast({
        title: "Topic required",
        description: "Please enter a topic to generate audience questions.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/ai/audience-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          platforms: activePlatforms,
          count,
          context: context.trim() || undefined,
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
            title: "Failed to generate questions",
            description: data.error,
            variant: "destructive",
          });
        }
        return;
      }
      const data = (await res.json()) as AudienceQuestionsResult;
      setResult(data);
      setExpandedIndex(0);
    } catch {
      toast({
        title: "Error",
        description: "Failed to generate audience questions.",
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

  function handleUse(post: string) {
    onApply(post);
    onClose();
    toast({
      title: "Post applied",
      description: "Q&A post added to your composer.",
    });
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-primary" />
            Audience Q&A Post Generator
          </DialogTitle>
          <DialogDescription>
            Generate common audience questions and ready-to-publish posts that answer them.
          </DialogDescription>
        </DialogHeader>

        {/* Input form */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="qa-topic">Topic</Label>
            <Input
              id="qa-topic"
              placeholder="e.g. starting a podcast, vegan nutrition, remote work productivity"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              maxLength={200}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="qa-context">
              Additional Context{" "}
              <span className="text-muted-foreground font-normal text-xs">(optional)</span>
            </Label>
            <Textarea
              id="qa-context"
              placeholder="Add any specific angle, audience, or expertise level..."
              value={context}
              onChange={(e) => setContext(e.target.value.slice(0, 500))}
              className="min-h-[60px] resize-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="qa-count">Number of Questions</Label>
            <select
              id="qa-count"
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring w-32"
            >
              {[3, 5, 7, 10].map((n) => (
                <option key={n} value={n}>
                  {n} questions
                </option>
              ))}
            </select>
          </div>

          <Button
            onClick={() => void generate()}
            disabled={loading || !topic.trim()}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating…
              </>
            ) : result ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Regenerate
              </>
            ) : (
              <>
                <HelpCircle className="h-4 w-4 mr-2" />
                Generate Q&A Posts
              </>
            )}
          </Button>
        </div>

        {/* Results */}
        {result && (
          <div className="flex flex-col gap-3 mt-2">
            <p className="text-sm font-medium text-foreground">
              {result.questions.length} Questions for &ldquo;{result.topic}&rdquo;
            </p>
            {result.questions.map((q, i) => (
              <div
                key={i}
                className="rounded-md border border-border bg-card overflow-hidden"
              >
                {/* Question header */}
                <button
                  type="button"
                  onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}
                  className="w-full flex items-start gap-2 p-3 text-left hover:bg-muted/50 transition-colors"
                >
                  <span
                    className={`flex-shrink-0 mt-0.5 text-[10px] font-semibold rounded-full px-2 py-0.5 ${CATEGORY_COLORS[q.category]}`}
                  >
                    {CATEGORY_LABELS[q.category]}
                  </span>
                  <span className="flex-1 text-sm font-medium text-foreground">{q.question}</span>
                  {expandedIndex === i ? (
                    <ChevronUp className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  )}
                </button>

                {/* Expanded content */}
                {expandedIndex === i && (
                  <div className="px-3 pb-3 flex flex-col gap-2 border-t border-border">
                    <div className="mt-2">
                      <p className="text-xs text-muted-foreground font-medium mb-1">Answer</p>
                      <p className="text-xs text-foreground/80">{q.answer}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground font-medium mb-1">Suggested Post</p>
                      <p className="text-sm whitespace-pre-wrap text-foreground/90 rounded-md bg-muted p-2">
                        {q.suggestedPost}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => void handleCopy(i, q.suggestedPost)}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {copiedIndex === i ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                        {copiedIndex === i ? "Copied" : "Copy Post"}
                      </button>
                      <button
                        onClick={() => handleUse(q.suggestedPost)}
                        className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                      >
                        Use in Post
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
