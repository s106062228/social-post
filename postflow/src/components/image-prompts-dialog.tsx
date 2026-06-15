"use client";

import { useState } from "react";
import { Loader2, Copy, Check, ImageIcon, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ImagePromptResult } from "@/lib/ai";

interface ImagePromptsDialogProps {
  open: boolean;
  onClose: () => void;
  content: string;
  selectedPlatforms: string[];
}

const STYLE_OPTIONS = [
  { value: "photorealistic", label: "Photo" },
  { value: "digital illustration", label: "Illustration" },
  { value: "graphic design flat style", label: "Graphic" },
  { value: "infographic style", label: "Infographic" },
  { value: "abstract art", label: "Abstract" },
];

const MOOD_OPTIONS = [
  { value: "professional", label: "Professional" },
  { value: "playful and fun", label: "Playful" },
  { value: "minimalist", label: "Minimalist" },
  { value: "vibrant and energetic", label: "Vibrant" },
  { value: "dramatic", label: "Dramatic" },
  { value: "warm and inviting", label: "Warm" },
  { value: "dark and moody", label: "Dark" },
];

export function ImagePromptsDialog({
  open,
  onClose,
  content,
  selectedPlatforms,
}: ImagePromptsDialogProps) {
  const [style, setStyle] = useState("photorealistic");
  const [mood, setMood] = useState("professional");
  const [loading, setLoading] = useState(false);
  const [prompts, setPrompts] = useState<ImagePromptResult[]>([]);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const generate = async () => {
    setLoading(true);
    setPrompts([]);
    try {
      const res = await fetch("/api/ai/image-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          platforms: selectedPlatforms,
          style,
          mood,
        }),
      });
      const data = (await res.json()) as {
        prompts?: ImagePromptResult[];
        error?: string;
      };
      if (!res.ok) {
        toast({
          title: "Error",
          description: data.error ?? "Failed to generate prompts",
          variant: "destructive",
        });
        return;
      }
      setPrompts(data.prompts ?? []);
    } catch {
      toast({
        title: "Error",
        description: "Network error. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyPrompt = async (prompt: string, idx: number) => {
    await navigator.clipboard.writeText(prompt);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
    toast({ title: "Copied!", description: "Image prompt copied to clipboard." });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            AI Image Prompt Generator
          </DialogTitle>
          <DialogDescription>
            Generate platform-optimized image prompts for your post. Use these
            with DALL-E, Midjourney, or Stable Diffusion.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Style selector */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Image Style
            </label>
            <div className="flex flex-wrap gap-2">
              {STYLE_OPTIONS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStyle(s.value)}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                    style === s.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-input bg-background text-muted-foreground hover:border-primary hover:text-foreground"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Mood selector */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Mood / Tone
            </label>
            <div className="flex flex-wrap gap-2">
              {MOOD_OPTIONS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMood(m.value)}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                    mood === m.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-input bg-background text-muted-foreground hover:border-primary hover:text-foreground"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <Button
            onClick={() => void generate()}
            disabled={
              loading || !content.trim() || selectedPlatforms.length === 0
            }
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating prompts...
              </>
            ) : prompts.length > 0 ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Regenerate Prompts
              </>
            ) : (
              <>
                <ImageIcon className="h-4 w-4 mr-2" />
                Generate Image Prompts
              </>
            )}
          </Button>

          {/* Results */}
          {prompts.length > 0 && (
            <div className="space-y-4">
              {prompts.map((p, idx) => (
                <div
                  key={idx}
                  className="border border-border rounded-lg p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {p.platform}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                        {p.aspectRatio}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                        {p.style}
                      </span>
                      {p.mood && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                          {p.mood}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyPrompt(p.prompt, idx)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {copiedIdx === idx ? (
                        <Check className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      {copiedIdx === idx ? "Copied!" : "Copy"}
                    </button>
                  </div>

                  {/* Main prompt */}
                  <div className="bg-muted rounded-md p-3 text-sm font-mono leading-relaxed text-foreground">
                    {p.prompt}
                  </div>

                  {/* Negative prompt */}
                  {p.negativePrompt && (
                    <div>
                      <span className="text-xs font-medium text-muted-foreground block mb-1">
                        Negative prompt (what to avoid):
                      </span>
                      <div className="bg-red-50 dark:bg-red-950 rounded-md p-2 text-xs text-red-700 dark:text-red-300 font-mono">
                        {p.negativePrompt}
                      </div>
                    </div>
                  )}

                  {/* Key elements */}
                  {p.keyElements && p.keyElements.length > 0 && (
                    <div>
                      <span className="text-xs font-medium text-muted-foreground block mb-1">
                        Key elements:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {p.keyElements.map((el, i) => (
                          <span
                            key={i}
                            className="text-xs px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground"
                          >
                            {el}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Color palette */}
                  {p.colorPalette && p.colorPalette.length > 0 && (
                    <div>
                      <span className="text-xs font-medium text-muted-foreground block mb-1">
                        Color palette:
                      </span>
                      <div className="flex gap-2">
                        {p.colorPalette.map((color, i) => (
                          <div key={i} className="group relative" title={color}>
                            <div
                              className="h-6 w-8 rounded border border-border cursor-pointer"
                              style={{ backgroundColor: color }}
                              onClick={() =>
                                void navigator.clipboard.writeText(color)
                              }
                            />
                            <span className="text-xs text-muted-foreground mt-0.5 block">
                              {color}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {!loading && prompts.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-4">
              Select a style and mood, then click Generate to create
              platform-optimized image prompts.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
