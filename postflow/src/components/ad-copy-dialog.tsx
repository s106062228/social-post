"use client";

import { useState } from "react";
import {
  Megaphone,
  Loader2,
  Copy,
  Check,
  RefreshCw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import type { AdCopyResult, AdCopyVariant } from "@/lib/ai";
import { PLATFORM_CHAR_LIMITS } from "@/lib/character-limits";
import type { Platform } from "@prisma/client";

const OBJECTIVES = [
  { value: "awareness", label: "Brand Awareness" },
  { value: "traffic", label: "Drive Traffic" },
  { value: "engagement", label: "Boost Engagement" },
  { value: "leads", label: "Generate Leads" },
  { value: "sales", label: "Increase Sales" },
  { value: "app_installs", label: "App Installs" },
  { value: "general", label: "General" },
] as const;

const BUDGETS = [
  { value: "small", label: "Small (< $500/mo)" },
  { value: "medium", label: "Medium ($500–$5k/mo)" },
  { value: "large", label: "Large (> $5k/mo)" },
] as const;

const PLATFORM_LABELS: Partial<Record<Platform, string>> = {
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  TWITTER: "X (Twitter)",
  LINKEDIN: "LinkedIn",
  THREADS: "Threads",
  TIKTOK: "TikTok",
  BLUESKY: "Bluesky",
  MASTODON: "Mastodon",
  PINTEREST: "Pinterest",
};

interface AdCopyDialogProps {
  open: boolean;
  onClose: () => void;
  content: string;
  platforms: Platform[];
  onApply: (text: string) => void;
}

function getHeadlineLimitColor(variant: AdCopyVariant): string {
  const limit = variant.platform === "LINKEDIN" ? 70
    : variant.platform === "TWITTER" ? 50
    : variant.platform === "PINTEREST" ? 100
    : 40;
  const pct = variant.charCounts.headline / limit;
  if (pct > 1) return "text-red-500";
  if (pct > 0.9) return "text-yellow-500";
  return "text-muted-foreground";
}

function getPrimaryTextLimitColor(variant: AdCopyVariant): string {
  const limit = PLATFORM_CHAR_LIMITS[variant.platform as Platform] ?? 280;
  const pct = variant.charCounts.primaryText / limit;
  if (pct > 1) return "text-red-500";
  if (pct > 0.9) return "text-yellow-500";
  return "text-muted-foreground";
}

export function AdCopyDialog({
  open,
  onClose,
  content,
  platforms,
  onApply,
}: AdCopyDialogProps) {
  const [objective, setObjective] = useState<string>("general");
  const [targetAudience, setTargetAudience] = useState("");
  const [budget, setBudget] = useState<string>("");
  const [result, setResult] = useState<AdCopyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const activePlatforms =
    platforms.length > 0
      ? platforms
      : (["FACEBOOK", "INSTAGRAM"] as Platform[]);

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/ad-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          platforms: activePlatforms,
          objective,
          targetAudience: targetAudience.trim() || undefined,
          budget: budget || undefined,
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
            title: "Failed to generate ad copy",
            description: data.error,
            variant: "destructive",
          });
        }
        return;
      }
      const data = (await res.json()) as AdCopyResult;
      setResult(data);
    } catch {
      toast({
        title: "Error",
        description: "Failed to generate ad copy.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy(key: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  function handleUse(text: string) {
    onApply(text);
    onClose();
    toast({
      title: "Ad copy applied",
      description: "Primary text added to your post.",
    });
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      onClose();
      if (!loading) setResult(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            Ad Copy Generator
          </DialogTitle>
          <DialogDescription>
            Generate platform-optimized paid ad copy from your post content.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ad-objective">Campaign Objective</Label>
              <select
                id="ad-objective"
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {OBJECTIVES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ad-budget">
                Budget Level{" "}
                <span className="text-muted-foreground font-normal text-xs">
                  (optional)
                </span>
              </Label>
              <select
                id="ad-budget"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Not specified</option>
                {BUDGETS.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ad-audience">
              Target Audience{" "}
              <span className="text-muted-foreground font-normal text-xs">
                (optional)
              </span>
            </Label>
            <Input
              id="ad-audience"
              placeholder="e.g. marketing professionals aged 30-50, B2B SaaS"
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              maxLength={300}
            />
          </div>

          <Button
            onClick={() => void generate()}
            disabled={loading || !content.trim()}
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
                <Megaphone className="h-4 w-4 mr-2" />
                Generate Ad Copy
              </>
            )}
          </Button>
        </div>

        {result && (
          <div className="flex flex-col gap-4 mt-2">
            {result.guidelines.length > 0 && (
              <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
                <p className="text-xs font-medium text-primary mb-1.5">
                  Optimization Guidelines
                </p>
                <ul className="flex flex-col gap-1">
                  {result.guidelines.map((g, i) => (
                    <li
                      key={i}
                      className="text-xs text-muted-foreground flex items-start gap-1.5"
                    >
                      <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary/60" />
                      {g}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium">Platform Ad Variants</p>
              {result.variants.map((variant) => (
                <div
                  key={variant.platform}
                  className="rounded-md border border-border bg-card p-3 flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">
                      {PLATFORM_LABELS[variant.platform as Platform] ??
                        variant.platform}
                    </span>
                    <span className="text-xs rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                      {variant.callToAction}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div>
                      <div className="flex items-center justify-between mb-0.5">
                        <p className="text-xs font-medium text-muted-foreground">
                          Headline
                        </p>
                        <span
                          className={`text-xs ${getHeadlineLimitColor(variant)}`}
                        >
                          {variant.charCounts.headline} chars
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-foreground">
                        {variant.headline}
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-0.5">
                        <p className="text-xs font-medium text-muted-foreground">
                          Primary Text
                        </p>
                        <span
                          className={`text-xs ${getPrimaryTextLimitColor(variant)}`}
                        >
                          {variant.charCounts.primaryText} chars
                        </span>
                      </div>
                      <p className="text-sm text-foreground/90 whitespace-pre-wrap">
                        {variant.primaryText}
                      </p>
                    </div>

                    {variant.targetingNotes && (
                      <p className="text-xs text-muted-foreground italic">
                        💡 {variant.targetingNotes}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 justify-end">
                    <button
                      onClick={() =>
                        void handleCopy(
                          `${variant.platform}-headline`,
                          variant.headline
                        )
                      }
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {copiedKey === `${variant.platform}-headline` ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      Copy Headline
                    </button>
                    <button
                      onClick={() =>
                        void handleCopy(
                          `${variant.platform}-text`,
                          variant.primaryText
                        )
                      }
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {copiedKey === `${variant.platform}-text` ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      Copy Text
                    </button>
                    <button
                      onClick={() => handleUse(variant.primaryText)}
                      className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                    >
                      Use in Post
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
