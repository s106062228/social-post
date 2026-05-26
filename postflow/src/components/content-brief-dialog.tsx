"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { FileText, Copy, Check, RefreshCw, Loader2 } from "lucide-react";
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
};

interface ContentBrief {
  title: string;
  keyMessages: string[];
  tone: string;
  contentStructure: string[];
  hashtagSuggestions: string[];
  callToAction: string;
  estimatedLength: string;
}

interface ContentBriefDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  platforms: Platform[];
  onApply: (content: string) => void;
}

export function ContentBriefDialog({
  open,
  onOpenChange,
  platforms,
  onApply,
}: ContentBriefDialogProps) {
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [goals, setGoals] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(
    () => new Set(platforms)
  );
  const [brief, setBrief] = useState<ContentBrief | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleGenerate() {
    if (!topic.trim()) {
      toast({ title: "Enter a topic first.", variant: "destructive" });
      return;
    }
    if (selectedPlatforms.size === 0) {
      toast({ title: "Select at least one platform.", variant: "destructive" });
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/ai/content-brief", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: topic.trim(),
            audience: audience.trim() || undefined,
            goals: goals.trim() || undefined,
            platforms: Array.from(selectedPlatforms),
          }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Failed to generate content brief");
        }
        const data = (await res.json()) as { brief: ContentBrief | null };
        if (!data.brief) {
          throw new Error("No brief returned from AI");
        }
        setBrief(data.brief);
      } catch (err) {
        toast({
          title: "Failed to generate content brief",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
      }
    });
  }

  function buildDraftFromBrief(b: ContentBrief): string {
    const parts: string[] = [];
    parts.push(b.title);
    parts.push("");
    b.keyMessages.forEach((msg) => parts.push(`• ${msg}`));
    parts.push("");
    parts.push(b.callToAction);
    if (b.hashtagSuggestions.length > 0) {
      parts.push("");
      parts.push(b.hashtagSuggestions.join(" "));
    }
    return parts.join("\n");
  }

  function buildFullBriefText(b: ContentBrief): string {
    const parts: string[] = [];
    parts.push(`Title: ${b.title}`);
    parts.push(`Tone: ${b.tone}`);
    parts.push(`Estimated length: ${b.estimatedLength}`);
    parts.push("");
    parts.push("Key messages:");
    b.keyMessages.forEach((m) => parts.push(`  • ${m}`));
    parts.push("");
    parts.push("Content structure:");
    b.contentStructure.forEach((s, i) => parts.push(`  ${i + 1}. ${s}`));
    parts.push("");
    parts.push(`Call to action: ${b.callToAction}`);
    parts.push("");
    parts.push(`Hashtags: ${b.hashtagSuggestions.join(" ")}`);
    return parts.join("\n");
  }

  async function handleCopyAll() {
    if (!brief) return;
    await navigator.clipboard.writeText(buildFullBriefText(brief));
    setCopied(true);
    setTimeout(() => setCopied(null as unknown as boolean), 1500);
  }

  function handleApply() {
    if (!brief) return;
    const draft = buildDraftFromBrief(brief);
    onApply(draft);
    onOpenChange(false);
    toast({ title: "Brief applied to composer", variant: "success" });
  }

  function handleOpenChange(val: boolean) {
    onOpenChange(val);
    if (!val) {
      setBrief(null);
      setTopic("");
      setAudience("");
      setGoals("");
    }
  }

  function togglePlatform(platform: string) {
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) {
        next.delete(platform);
      } else {
        next.add(platform);
      }
      return next;
    });
  }

  const availablePlatforms = platforms.length > 0 ? platforms : (["FACEBOOK", "INSTAGRAM", "THREADS"] as Platform[]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            AI Content Brief
          </DialogTitle>
          <DialogDescription>
            Generate a structured content brief to guide your post creation.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Inputs */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="brief-topic">Topic *</Label>
            <Input
              id="brief-topic"
              placeholder="e.g. summer product launch, company milestone, industry tips…"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleGenerate();
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="brief-audience">Target audience <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              id="brief-audience"
              placeholder="e.g. small business owners, tech enthusiasts, fitness beginners…"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="brief-goals">Goals <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              id="brief-goals"
              placeholder="e.g. drive traffic to website, increase brand awareness, announce a sale…"
              value={goals}
              onChange={(e) => setGoals(e.target.value)}
              className="min-h-[72px] resize-none"
            />
          </div>

          {/* Platform selector */}
          <div className="flex flex-col gap-1.5">
            <Label>Platforms</Label>
            <div className="flex flex-wrap gap-2">
              {availablePlatforms.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePlatform(p)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    selectedPlatforms.has(p)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background text-foreground hover:bg-muted"
                  }`}
                >
                  {PLATFORM_LABELS[p] ?? p}
                </button>
              ))}
            </div>
          </div>

          {/* Generate button */}
          {!brief ? (
            <Button
              onClick={handleGenerate}
              disabled={isPending || !topic.trim()}
              className="w-full"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating brief…
                </>
              ) : (
                <>
                  <FileText className="mr-2 h-4 w-4" />
                  Generate Content Brief
                </>
              )}
            </Button>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Brief output */}
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">

                {/* Title */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Title / Hook</p>
                  <p className="text-sm font-medium text-foreground">{brief.title}</p>
                </div>

                {/* Tone + Estimated Length */}
                <div className="flex gap-6">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Tone</p>
                    <p className="text-sm text-foreground">{brief.tone}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Estimated length</p>
                    <p className="text-sm text-foreground">{brief.estimatedLength}</p>
                  </div>
                </div>

                {/* Key messages */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Key messages</p>
                  <ul className="space-y-1">
                    {brief.keyMessages.map((msg, i) => (
                      <li key={i} className="text-sm text-foreground flex gap-2">
                        <span className="text-muted-foreground shrink-0">•</span>
                        {msg}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Content structure */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Content structure</p>
                  <ol className="space-y-1">
                    {brief.contentStructure.map((step, i) => (
                      <li key={i} className="text-sm text-foreground flex gap-2">
                        <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Call to action */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Call to action</p>
                  <p className="text-sm text-foreground">{brief.callToAction}</p>
                </div>

                {/* Hashtag suggestions */}
                {brief.hashtagSuggestions.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Suggested hashtags</p>
                    <div className="flex flex-wrap gap-1">
                      {brief.hashtagSuggestions.map((tag, i) => (
                        <span
                          key={i}
                          className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleApply} className="flex-1">
                  Apply to Composer
                </Button>
                <Button variant="outline" size="sm" onClick={handleCopyAll}>
                  {copied ? (
                    <Check className="mr-1 h-3 w-3 text-green-600" />
                  ) : (
                    <Copy className="mr-1 h-3 w-3" />
                  )}
                  Copy all
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleGenerate}
                  disabled={isPending}
                >
                  <RefreshCw className={`mr-1 h-3 w-3 ${isPending ? "animate-spin" : ""}`} />
                  Regenerate
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
