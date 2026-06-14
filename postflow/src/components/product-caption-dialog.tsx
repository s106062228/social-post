"use client";

import { useState } from "react";
import {
  Loader2,
  Copy,
  Check,
  RefreshCw,
  ShoppingBag,
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
import type { Platform } from "@prisma/client";
import type { ProductCaption, ProductCaptionsResult } from "@/lib/ai";
import { PLATFORM_CHAR_LIMITS } from "@/lib/character-limits";

const PROMOTION_TYPES = [
  { value: "general", label: "General" },
  { value: "launch", label: "Product Launch" },
  { value: "sale", label: "Sale / Discount" },
  { value: "awareness", label: "Brand Awareness" },
  { value: "review", label: "Customer Review" },
] as const;

type PromotionType = "launch" | "sale" | "awareness" | "review" | "general";

const PLATFORM_LABELS: Partial<Record<Platform, string>> = {
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  TWITTER: "X (Twitter)",
  LINKEDIN: "LinkedIn",
  THREADS: "Threads",
  TIKTOK: "TikTok",
  BLUESKY: "Bluesky",
  MASTODON: "Mastodon",
};

interface ProductCaptionDialogProps {
  open: boolean;
  onClose: () => void;
  platforms: Platform[];
  onApply: (caption: string) => void;
}

export function ProductCaptionDialog({
  open,
  onClose,
  platforms,
  onApply,
}: ProductCaptionDialogProps) {
  const [productName, setProductName] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [promotionType, setPromotionType] = useState<PromotionType>("general");
  const [targetAudience, setTargetAudience] = useState("");
  const [result, setResult] = useState<ProductCaptionsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedPlatform, setCopiedPlatform] = useState<string | null>(null);

  const activePlatforms = platforms.length > 0 ? platforms : (["FACEBOOK", "INSTAGRAM", "TWITTER"] as Platform[]);

  async function generate() {
    if (!productName.trim() || !productDescription.trim()) {
      toast({
        title: "Missing information",
        description: "Please enter a product name and description.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/ai/product-captions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: productName.trim(),
          productDescription: productDescription.trim(),
          platforms: activePlatforms,
          promotionType,
          targetAudience: targetAudience.trim() || undefined,
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
            title: "Failed to generate captions",
            description: data.error,
            variant: "destructive",
          });
        }
        return;
      }
      const data = (await res.json()) as ProductCaptionsResult;
      setResult(data);
    } catch {
      toast({
        title: "Error",
        description: "Failed to generate captions.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy(platform: string, caption: string) {
    await navigator.clipboard.writeText(caption);
    setCopiedPlatform(platform);
    setTimeout(() => setCopiedPlatform(null), 2000);
  }

  function handleUse(caption: string) {
    onApply(caption);
    onClose();
    toast({
      title: "Caption applied",
      description: "Caption added to your post.",
    });
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      onClose();
      if (!loading) {
        setResult(null);
      }
    }
  }

  function getCharLimitColor(caption: ProductCaption): string {
    const platform = caption.platform as Platform;
    const limit = PLATFORM_CHAR_LIMITS[platform];
    if (!limit) return "text-muted-foreground";
    const pct = caption.charCount / limit;
    if (pct > 1) return "text-red-500";
    if (pct > 0.9) return "text-yellow-500";
    return "text-muted-foreground";
  }

  function getCharLimitLabel(caption: ProductCaption): string {
    const platform = caption.platform as Platform;
    const limit = PLATFORM_CHAR_LIMITS[platform];
    if (!limit) return `${caption.charCount} chars`;
    return `${caption.charCount}/${limit}`;
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-primary" />
            Product Caption Generator
          </DialogTitle>
          <DialogDescription>
            Generate platform-optimized captions for your product or service.
          </DialogDescription>
        </DialogHeader>

        {/* Input form */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="product-name">Product / Service Name</Label>
            <Input
              id="product-name"
              placeholder="e.g. Premium Coffee Blend"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              maxLength={200}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="product-desc">
              Description{" "}
              <span className="text-muted-foreground font-normal text-xs">
                ({productDescription.length}/2000)
              </span>
            </Label>
            <Textarea
              id="product-desc"
              placeholder="Describe your product, its features, benefits, and what makes it unique..."
              value={productDescription}
              onChange={(e) => setProductDescription(e.target.value.slice(0, 2000))}
              className="min-h-[90px] resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="promo-type">Promotion Type</Label>
              <select
                id="promo-type"
                value={promotionType}
                onChange={(e) => setPromotionType(e.target.value as PromotionType)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {PROMOTION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="target-audience">
                Target Audience{" "}
                <span className="text-muted-foreground font-normal text-xs">(optional)</span>
              </Label>
              <Input
                id="target-audience"
                placeholder="e.g. fitness enthusiasts, 25-40"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                maxLength={300}
              />
            </div>
          </div>

          <Button
            onClick={() => void generate()}
            disabled={loading || !productName.trim() || !productDescription.trim()}
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
                <ShoppingBag className="h-4 w-4 mr-2" />
                Generate Captions
              </>
            )}
          </Button>
        </div>

        {/* Results */}
        {result && (
          <div className="flex flex-col gap-4 mt-2">
            {result.keyMessages.length > 0 && (
              <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
                <p className="text-xs font-medium text-primary mb-1.5">Key Messages</p>
                <ul className="flex flex-col gap-1">
                  {result.keyMessages.map((msg, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary/60" />
                      {msg}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium">Platform Captions</p>
              {result.captions.map((caption) => (
                <div
                  key={caption.platform}
                  className="rounded-md border border-border bg-card p-3 flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground">
                        {PLATFORM_LABELS[caption.platform as Platform] ?? caption.platform}
                      </span>
                      <span className="text-xs rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                        {caption.tone}
                      </span>
                    </div>
                    <span className={`text-xs ${getCharLimitColor(caption)}`}>
                      {getCharLimitLabel(caption)}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap text-foreground/90">
                    {caption.caption}
                  </p>
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      onClick={() => void handleCopy(caption.platform, caption.caption)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {copiedPlatform === caption.platform ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      {copiedPlatform === caption.platform ? "Copied" : "Copy"}
                    </button>
                    <button
                      onClick={() => handleUse(caption.caption)}
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
