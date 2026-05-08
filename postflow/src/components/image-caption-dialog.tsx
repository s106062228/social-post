"use client";

import { useState } from "react";
import { Camera, Sparkles, Loader2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { PLATFORM_CHAR_LIMITS } from "@/lib/character-limits";
import type { Platform } from "@prisma/client";

interface Caption {
  platform: string;
  content: string;
}

interface ImageCaptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string;
  platforms: Platform[];
  onUseCaption: (content: string) => void;
}

export function ImageCaptionDialog({
  open,
  onOpenChange,
  imageUrl,
  platforms,
  onUseCaption,
}: ImageCaptionDialogProps) {
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  async function fetchCaptions() {
    setLoading(true);
    setCaptions([]);
    try {
      const res = await fetch("/api/ai/caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl,
          platforms: platforms.length > 0 ? platforms : ["INSTAGRAM"],
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to generate captions");
      }
      const data = (await res.json()) as { captions: Caption[] };
      setCaptions(data.captions);
    } catch (err) {
      toast({
        title: "Caption generation failed",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(value: boolean) {
    if (value && captions.length === 0) {
      void fetchCaptions();
    }
    onOpenChange(value);
  }

  async function copyCaption(content: string, index: number) {
    await navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[580px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-4 w-4" />
            <Sparkles className="h-4 w-4" />
            AI Caption Generator
          </DialogTitle>
          <DialogDescription>
            AI-generated captions for your image, optimized per platform.
          </DialogDescription>
        </DialogHeader>

        {/* Image preview */}
        <div className="rounded-md overflow-hidden border border-input bg-muted/30 max-h-40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Media preview"
            className="w-full object-cover max-h-40"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>

        <div className="flex flex-col gap-3 py-2">
          {loading && (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing image and generating captions…
            </div>
          )}

          {!loading && captions.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">
              No captions generated yet. Click Regenerate to try again.
            </p>
          )}

          {captions.map((caption, i) => {
            const limit = PLATFORM_CHAR_LIMITS[caption.platform as Platform];
            const count = caption.content.length;
            const pct = limit ? count / limit : 0;
            const overLimit = pct > 1;
            const nearLimit = pct >= 0.9;

            return (
              <div
                key={i}
                className="flex flex-col gap-2 rounded-md border border-input bg-muted/20 p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {caption.platform}
                  </span>
                  {limit && (
                    <span
                      className={`text-xs ${
                        overLimit
                          ? "text-red-500"
                          : nearLimit
                          ? "text-yellow-500"
                          : "text-muted-foreground"
                      }`}
                    >
                      {count}/{limit}
                    </span>
                  )}
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {caption.content}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void copyCaption(caption.content, i)}
                    className="h-7 gap-1 text-xs"
                  >
                    {copiedIndex === i ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    {copiedIndex === i ? "Copied" : "Copy"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      onUseCaption(caption.content);
                      onOpenChange(false);
                      toast({ title: "Caption applied to post content", variant: "success" });
                    }}
                    className="h-7 text-xs"
                  >
                    Use as content
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fetchCaptions}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            )}
            Regenerate
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
