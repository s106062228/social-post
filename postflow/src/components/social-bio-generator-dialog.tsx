"use client";

import { useState } from "react";
import { Bot, Copy, Check, RefreshCw, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";

interface SocialBio {
  platform: string;
  bio: string;
  charCount: number;
  charLimit: number;
}

interface SocialBioGeneratorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectedPlatforms: string[];
}

const PLATFORM_LABELS: Record<string, string> = {
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  TWITTER: "X (Twitter)",
  THREADS: "Threads",
  LINKEDIN: "LinkedIn",
  TIKTOK: "TikTok",
  PINTEREST: "Pinterest",
  YOUTUBE: "YouTube",
  REDDIT: "Reddit",
  BLUESKY: "Bluesky",
  MASTODON: "Mastodon",
  TELEGRAM: "Telegram",
  TUMBLR: "Tumblr",
  WORDPRESS: "WordPress",
  MEDIUM: "Medium",
  GHOST: "Ghost",
  DEVTO: "Dev.to",
  HASHNODE: "Hashnode",
  NOSTR: "Nostr",
  PIXELFED: "Pixelfed",
  VIMEO: "Vimeo",
  BEEHIIV: "Beehiiv",
  GOOGLE_BUSINESS: "Google Business",
};

export function SocialBioGeneratorDialog({
  open,
  onOpenChange,
  connectedPlatforms,
}: SocialBioGeneratorDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [niche, setNiche] = useState("");
  const [keywordsInput, setKeywordsInput] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(
    connectedPlatforms.slice(0, 5)
  );
  const [bios, setBios] = useState<SocialBio[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedPlatform, setCopiedPlatform] = useState<string | null>(null);

  const allPlatforms = Array.from(
    new Set([...connectedPlatforms, ...Object.keys(PLATFORM_LABELS)])
  ).filter((p) => PLATFORM_LABELS[p]);

  function togglePlatform(platform: string) {
    setSelectedPlatforms((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform]
    );
  }

  async function handleGenerate() {
    if (!name.trim() || !description.trim()) {
      toast({
        title: "Missing information",
        description: "Please enter your name/brand and a description.",
        variant: "destructive",
      });
      return;
    }
    if (selectedPlatforms.length === 0) {
      toast({
        title: "No platforms selected",
        description: "Please select at least one platform.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setBios([]);
    try {
      const keywords = keywordsInput
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);

      const res = await fetch("/api/ai/generate-bios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          platforms: selectedPlatforms,
          niche: niche.trim() || undefined,
          keywords: keywords.length > 0 ? keywords : undefined,
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to generate bios");
      }

      const data = (await res.json()) as { bios: SocialBio[] };
      setBios(data.bios);

      if (data.bios.length === 0) {
        toast({
          title: "No bios generated",
          description: "Please try again with different inputs.",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to generate bios",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy(platform: string, bio: string) {
    try {
      await navigator.clipboard.writeText(bio);
      setCopiedPlatform(platform);
      setTimeout(() => setCopiedPlatform(null), 2000);
      toast({ title: "Copied!", description: "Bio copied to clipboard." });
    } catch {
      toast({
        title: "Copy failed",
        description: "Please copy the text manually.",
        variant: "destructive",
      });
    }
  }

  function getCharCountColor(charCount: number, charLimit: number) {
    const pct = charCount / charLimit;
    if (pct >= 1) return "text-red-600";
    if (pct >= 0.9) return "text-amber-600";
    return "text-muted-foreground";
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            AI Social Media Bio Generator
          </DialogTitle>
          <DialogDescription>
            Generate optimized bios for each of your social media platforms
            instantly.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Inputs */}
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="bio-name">Name / Brand *</Label>
              <Input
                id="bio-name"
                placeholder="e.g. Jane Doe or Acme Co."
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="bio-description">What you do *</Label>
              <Textarea
                id="bio-description"
                placeholder="e.g. I help small businesses grow on social media through strategic content and organic marketing."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                {description.length}/500 characters
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="bio-niche">Niche / Industry</Label>
                <Input
                  id="bio-niche"
                  placeholder="e.g. Marketing, Tech, Fitness"
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  maxLength={100}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="bio-keywords">Keywords (comma-separated)</Label>
                <Input
                  id="bio-keywords"
                  placeholder="e.g. SEO, growth, strategy"
                  value={keywordsInput}
                  onChange={(e) => setKeywordsInput(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Platform selection */}
          <div className="grid gap-1.5">
            <Label>Platforms</Label>
            <div className="flex flex-wrap gap-2">
              {allPlatforms.map((platform) => (
                <button
                  key={platform}
                  type="button"
                  onClick={() => togglePlatform(platform)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    selectedPlatforms.includes(platform)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground hover:border-primary/50"
                  } ${connectedPlatforms.includes(platform) ? "ring-1 ring-green-400/50" : ""}`}
                >
                  {PLATFORM_LABELS[platform]}
                  {connectedPlatforms.includes(platform) && (
                    <span className="ml-1 text-green-500">•</span>
                  )}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Green dot = connected account. {selectedPlatforms.length} platform
              {selectedPlatforms.length !== 1 ? "s" : ""} selected.
            </p>
          </div>

          {/* Generate button */}
          <Button
            onClick={handleGenerate}
            disabled={loading || !name.trim() || !description.trim()}
            className="w-full"
          >
            {loading ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="mr-2 h-4 w-4" />
            )}
            {loading ? "Generating…" : bios.length > 0 ? "Regenerate" : "Generate Bios"}
          </Button>

          {/* Results */}
          {bios.length > 0 && (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium text-muted-foreground">
                Generated {bios.length} bio{bios.length !== 1 ? "s" : ""}
              </p>
              {bios.map((bio) => (
                <div
                  key={bio.platform}
                  className="rounded-lg border bg-card p-4"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold">
                      {PLATFORM_LABELS[bio.platform] ?? bio.platform}
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs ${getCharCountColor(bio.charCount, bio.charLimit)}`}
                      >
                        {bio.charCount}/{bio.charLimit}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => handleCopy(bio.platform, bio.bio)}
                      >
                        {copiedPlatform === bio.platform ? (
                          <Check className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-foreground">
                    {bio.bio}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
