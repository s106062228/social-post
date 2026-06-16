"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { CarouselContent } from "@/lib/ai";

interface CarouselContentDialogProps {
  open: boolean;
  onClose: () => void;
  selectedPlatforms: string[];
  onApply: (content: string) => void;
}

const TONE_OPTIONS = [
  "professional",
  "casual",
  "educational",
  "entertaining",
  "inspirational",
];

export function CarouselContentDialog({
  open,
  onClose,
  selectedPlatforms,
  onApply,
}: CarouselContentDialogProps) {
  const [topic, setTopic] = useState("");
  const [slideCount, setSlideCount] = useState(5);
  const [tone, setTone] = useState("");
  const [audience, setAudience] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [carousel, setCarousel] = useState<CarouselContent | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function handleGenerate() {
    if (!topic.trim()) return;
    setLoading(true);
    setError(null);
    setCarousel(null);
    try {
      const res = await fetch("/api/ai/carousel-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          slideCount,
          platforms: selectedPlatforms.length > 0 ? selectedPlatforms : ["instagram", "linkedin"],
          tone: tone || undefined,
          audience: audience || undefined,
        }),
      });
      const data = (await res.json()) as { carousel?: CarouselContent; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to generate");
        return;
      }
      setCarousel(data.carousel ?? null);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy(text: string, key: string) {
    void navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  function buildCarouselSummary(): string {
    if (!carousel) return "";
    const parts: string[] = [];
    parts.push(`📌 ${carousel.coverSlide.headline}`);
    parts.push(carousel.coverSlide.subtitle);
    parts.push("");
    for (const slide of carousel.slides) {
      parts.push(`Slide ${slide.slideNumber}: ${slide.headline}`);
      parts.push(slide.bodyText);
      parts.push(`💡 ${slide.keyTakeaway}`);
      parts.push("");
    }
    parts.push(`👉 ${carousel.closingSlide.cta}`);
    if (carousel.closingSlide.hashtags.length > 0) {
      parts.push(carousel.closingSlide.hashtags.join(" "));
    }
    return parts.join("\n");
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Carousel Content Planner</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="carousel-topic">Topic *</Label>
            <Input
              id="carousel-topic"
              placeholder="e.g. 5 tips for growing your Instagram"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              maxLength={300}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="slide-count">Slides ({slideCount})</Label>
              <input
                id="slide-count"
                type="range"
                min={3}
                max={15}
                value={slideCount}
                onChange={(e) => setSlideCount(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>3</span><span>15</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="carousel-tone">Tone (optional)</Label>
              <select
                id="carousel-tone"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">Auto</option>
                {TONE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="carousel-audience">Target Audience (optional)</Label>
            <Input
              id="carousel-audience"
              placeholder="e.g. small business owners, fitness enthusiasts"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              maxLength={200}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button
            onClick={handleGenerate}
            disabled={loading || !topic.trim()}
            className="w-full"
          >
            {loading ? "Generating..." : carousel ? "Regenerate" : "Generate Carousel"}
          </Button>

          {carousel && (
            <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">{carousel.title}</h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onApply(buildCarouselSummary());
                    onClose();
                  }}
                >
                  Use in Composer
                </Button>
              </div>

              {/* Cover slide */}
              <div className="rounded-md border bg-background p-3 space-y-1">
                <Badge variant="secondary" className="text-xs">Cover</Badge>
                <p className="font-medium text-sm">{carousel.coverSlide.headline}</p>
                <p className="text-xs text-muted-foreground">{carousel.coverSlide.subtitle}</p>
              </div>

              {/* Content slides */}
              {carousel.slides.map((slide) => (
                <div key={slide.slideNumber} className="rounded-md border bg-background p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">Slide {slide.slideNumber}</Badge>
                        <span className="font-medium text-sm">{slide.headline}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{slide.bodyText}</p>
                      <p className="text-xs text-blue-600 dark:text-blue-400">💡 {slide.keyTakeaway}</p>
                      <p className="text-xs text-purple-600 dark:text-purple-400 italic">🎨 {slide.visualDescription}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="shrink-0 text-xs"
                      onClick={() => handleCopy(`${slide.headline}\n\n${slide.bodyText}\n\n💡 ${slide.keyTakeaway}`, `slide-${slide.slideNumber}`)}
                    >
                      {copied === `slide-${slide.slideNumber}` ? "Copied!" : "Copy"}
                    </Button>
                  </div>
                </div>
              ))}

              {/* Closing slide */}
              <div className="rounded-md border bg-background p-3 space-y-1">
                <Badge variant="secondary" className="text-xs">Closing</Badge>
                <p className="font-medium text-sm">👉 {carousel.closingSlide.cta}</p>
                {carousel.closingSlide.hashtags.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {carousel.closingSlide.hashtags.join(" ")}
                  </p>
                )}
              </div>

              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => handleCopy(buildCarouselSummary(), "full")}
              >
                {copied === "full" ? "Copied!" : "Copy Full Carousel"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
