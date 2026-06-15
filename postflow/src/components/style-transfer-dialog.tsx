"use client";

import { useState } from "react";
import {
  Loader2,
  Copy,
  Check,
  RefreshCw,
  Sparkles,
  MessageSquare,
  Briefcase,
  Scissors,
  Zap,
  Smile,
  Star,
  BookOpen,
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

type StyleTransferStyle =
  | "casual"
  | "professional"
  | "concise"
  | "engaging"
  | "humorous"
  | "inspirational"
  | "educational";

const STYLES: {
  key: StyleTransferStyle;
  label: string;
  description: string;
  Icon: React.ElementType;
  color: string;
}[] = [
  {
    key: "casual",
    label: "Casual",
    description: "Relaxed, conversational, approachable",
    Icon: MessageSquare,
    color: "text-blue-500",
  },
  {
    key: "professional",
    label: "Professional",
    description: "Polished, formal, authoritative",
    Icon: Briefcase,
    color: "text-slate-600",
  },
  {
    key: "concise",
    label: "Concise",
    description: "Short, punchy, high-impact",
    Icon: Scissors,
    color: "text-orange-500",
  },
  {
    key: "engaging",
    label: "Engaging",
    description: "Strong hooks, CTAs, interaction prompts",
    Icon: Zap,
    color: "text-yellow-500",
  },
  {
    key: "humorous",
    label: "Humorous",
    description: "Witty, light-hearted, relatable",
    Icon: Smile,
    color: "text-pink-500",
  },
  {
    key: "inspirational",
    label: "Inspirational",
    description: "Uplifting, empowering, motivational",
    Icon: Star,
    color: "text-purple-500",
  },
  {
    key: "educational",
    label: "Educational",
    description: "Informative, clear, teaches the audience",
    Icon: BookOpen,
    color: "text-green-500",
  },
];

interface StyleTransferResult {
  styledContent: string;
  changes: string[];
  styleName: string;
}

interface StyleTransferDialogProps {
  open: boolean;
  onClose: () => void;
  content: string;
  platforms: string[];
  onApply: (newContent: string) => void;
}

export function StyleTransferDialog({
  open,
  onClose,
  content,
  platforms,
  onApply,
}: StyleTransferDialogProps) {
  const [selectedStyle, setSelectedStyle] = useState<StyleTransferStyle | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StyleTransferResult | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleTransfer(style: StyleTransferStyle) {
    setSelectedStyle(style);
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/ai/style-transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, targetStyle: style, platforms }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "Failed to transfer style");
      }
      const data = (await res.json()) as StyleTransferResult;
      setResult(data);
    } catch (err) {
      toast({
        title: "Style transfer failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleRegenerate() {
    if (!selectedStyle) return;
    await handleTransfer(selectedStyle);
  }

  function handleApply() {
    if (!result) return;
    onApply(result.styledContent);
    toast({ title: "Style applied", description: "Post content updated." });
    onClose();
  }

  async function handleCopy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.styledContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleClose() {
    setResult(null);
    setSelectedStyle(null);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            Style Transfer
          </DialogTitle>
          <DialogDescription>
            Rewrite your post in a different style. Select a style below to transform your content.
          </DialogDescription>
        </DialogHeader>

        {/* Style grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {STYLES.map(({ key, label, description, Icon, color }) => (
            <button
              key={key}
              type="button"
              onClick={() => void handleTransfer(key)}
              disabled={loading}
              className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50 ${
                selectedStyle === key
                  ? "border-primary bg-primary/5"
                  : "border-input bg-background"
              }`}
            >
              <Icon className={`h-4 w-4 ${color}`} />
              <span className="text-sm font-medium">{label}</span>
              <span className="text-xs text-muted-foreground leading-tight">{description}</span>
            </button>
          ))}
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Transforming style…</span>
          </div>
        )}

        {/* Result */}
        {result && !loading && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {/* Before */}
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Original
                </p>
                <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap min-h-[80px]">
                  {content}
                </div>
                <p className="text-xs text-muted-foreground text-right">
                  {content.length} chars
                </p>
              </div>
              {/* After */}
              <div className="space-y-1">
                <p className="text-xs font-medium text-primary uppercase tracking-wide">
                  {result.styleName}
                </p>
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm whitespace-pre-wrap min-h-[80px]">
                  {result.styledContent}
                </div>
                <p className="text-xs text-muted-foreground text-right">
                  {result.styledContent.length} chars
                </p>
              </div>
            </div>

            {/* Changes */}
            {result.changes.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Changes made:</p>
                <ul className="space-y-0.5">
                  {result.changes.map((change, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                      <span className="text-primary mt-0.5">•</span>
                      {change}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              <Button onClick={handleApply} size="sm">
                Apply Style
              </Button>
              <Button variant="outline" size="sm" onClick={() => void handleCopy()}>
                {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                Copy
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleRegenerate()}
                disabled={loading}
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Regenerate
              </Button>
            </div>
          </div>
        )}

        {/* Prompt when nothing selected */}
        {!loading && !result && (
          <p className="text-xs text-muted-foreground text-center py-2">
            Click a style above to transform your post content.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
