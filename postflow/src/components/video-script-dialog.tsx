"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Film, Copy, Check, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { Platform } from "@prisma/client";

const PLATFORM_LABELS: Record<string, string> = {
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  THREADS: "Threads",
  LINKEDIN: "LinkedIn",
  PINTEREST: "Pinterest",
  YOUTUBE: "YouTube",
  TIKTOK: "TikTok",
  TWITTER: "X (Twitter)",
  BLUESKY: "Bluesky",
  MASTODON: "Mastodon",
  TELEGRAM: "Telegram",
  REDDIT: "Reddit",
  NOSTR: "Nostr",
  TUMBLR: "Tumblr",
  WORDPRESS: "WordPress",
  MEDIUM: "Medium",
  GHOST: "Ghost",
  DEVTO: "Dev.to",
  GOOGLE_BUSINESS: "Google Business",
  HASHNODE: "Hashnode",
  BEEHIIV: "Beehiiv",
  PIXELFED: "Pixelfed",
  VIMEO: "Vimeo",
};

interface VideoScript {
  hook: string;
  body: string;
  callToAction: string;
  captions: { platform: string; content: string }[];
  estimatedDuration: number;
}

interface VideoScriptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  platforms: Platform[];
  onApply: (content: string) => void;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded p-1 text-muted-foreground hover:text-foreground"
      title="Copy"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function ScriptSection({ title, content }: { title: string; content: string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
        <CopyButton text={content} />
      </div>
      <p className="whitespace-pre-wrap text-sm">{content}</p>
    </div>
  );
}

export function VideoScriptDialog({
  open,
  onOpenChange,
  platforms,
  onApply,
}: VideoScriptDialogProps) {
  const [topic, setTopic] = useState("");
  const [duration, setDuration] = useState("60");
  const [tone, setTone] = useState("");
  const [script, setScript] = useState<VideoScript | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleGenerate() {
    if (!topic.trim()) {
      toast({ title: "Enter a topic first.", variant: "destructive" });
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/ai/video-script", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: topic.trim(),
            duration: parseInt(duration, 10),
            platforms: platforms.length > 0 ? platforms : ["FACEBOOK"],
            tone: tone || undefined,
          }),
        });
        if (!res.ok) {
          const err = (await res.json()) as { error?: string };
          throw new Error(err.error ?? "Failed to generate script");
        }
        const data = (await res.json()) as { script: VideoScript };
        setScript(data.script);
      } catch (err) {
        toast({
          title: "Failed to generate video script",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Film className="h-4 w-4" />
            AI Video Script Generator
          </DialogTitle>
          <DialogDescription>
            Generate a structured video script with hook, body, CTA, and
            platform-optimized captions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <Label htmlFor="video-topic">Topic</Label>
              <Input
                id="video-topic"
                placeholder="e.g. How to grow your Instagram following"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="video-duration">Duration</Label>
              <select
                id="video-duration"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="15">15 seconds</option>
                <option value="30">30 seconds</option>
                <option value="60">1 minute</option>
                <option value="90">1.5 minutes</option>
                <option value="180">3 minutes</option>
                <option value="300">5 minutes</option>
                <option value="600">10 minutes</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="video-tone">Tone (optional)</Label>
              <select
                id="video-tone"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="">Any tone</option>
                <option value="professional">Professional</option>
                <option value="casual">Casual</option>
                <option value="educational">Educational</option>
                <option value="entertaining">Entertaining</option>
                <option value="inspirational">Inspirational</option>
              </select>
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={isPending || !topic.trim()}
            className="w-full"
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating script…
              </>
            ) : (
              <>
                <Film className="mr-2 h-4 w-4" />
                Generate Script
              </>
            )}
          </Button>

          {script && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  Script (~{script.estimatedDuration}s)
                </span>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isPending}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <RefreshCw className="h-3 w-3" />
                  Regenerate
                </button>
              </div>

              <ScriptSection title="Hook (Opening)" content={script.hook} />
              <ScriptSection title="Body (Main Content)" content={script.body} />
              <ScriptSection title="Call-to-Action" content={script.callToAction} />

              {script.captions.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Platform Captions</p>
                  {script.captions.map((cap) => (
                    <div
                      key={cap.platform}
                      className="rounded-md border bg-muted/20 p-3"
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground">
                          {PLATFORM_LABELS[cap.platform] ?? cap.platform}
                        </span>
                        <div className="flex items-center gap-1">
                          <CopyButton text={cap.content} />
                          <button
                            type="button"
                            onClick={() => {
                              onApply(cap.content);
                              onOpenChange(false);
                              toast({ title: "Caption applied to post" });
                            }}
                            className="rounded-md bg-primary px-2 py-0.5 text-xs text-primary-foreground hover:bg-primary/90"
                          >
                            Use
                          </button>
                        </div>
                      </div>
                      <p className="whitespace-pre-wrap text-sm">{cap.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
