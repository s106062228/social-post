"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Wand2, Loader2, Copy, Check, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { PLATFORM_CHAR_LIMITS } from "@/lib/character-limits";
import type { Platform } from "@prisma/client";

interface BulkGeneratedItem {
  topic: string;
  content: string;
  charCount: number;
}

interface BulkGenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

const ALL_PLATFORMS = [
  "FACEBOOK",
  "INSTAGRAM",
  "THREADS",
  "TWITTER",
  "LINKEDIN",
  "TIKTOK",
  "YOUTUBE",
  "BLUESKY",
  "MASTODON",
  "REDDIT",
];

const TONE_OPTIONS = [
  { value: "", label: "Auto (default)" },
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual" },
  { value: "humorous", label: "Humorous" },
  { value: "inspirational", label: "Inspirational" },
  { value: "educational", label: "Educational" },
  { value: "urgent", label: "Urgent" },
];

export function BulkGenerateDialog({
  open,
  onOpenChange,
  onCreated,
}: BulkGenerateDialogProps) {
  const [topicsText, setTopicsText] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([
    "FACEBOOK",
    "INSTAGRAM",
  ]);
  const [tone, setTone] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [results, setResults] = useState<BulkGeneratedItem[]>([]);
  const [campaignName, setCampaignName] = useState("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const topics = topicsText
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);

  function togglePlatform(platform: string) {
    setSelectedPlatforms((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform]
    );
  }

  async function handleGenerate() {
    if (topics.length === 0) {
      toast({ title: "Enter at least one topic", variant: "destructive" });
      return;
    }
    if (topics.length > 20) {
      toast({ title: "Maximum 20 topics allowed", variant: "destructive" });
      return;
    }
    if (selectedPlatforms.length === 0) {
      toast({ title: "Select at least one platform", variant: "destructive" });
      return;
    }

    setIsGenerating(true);
    setResults([]);
    try {
      const res = await fetch("/api/ai/bulk-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topics, platforms: selectedPlatforms, tone: tone || undefined }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Generation failed");
      }
      const data = (await res.json()) as { generated: BulkGeneratedItem[] };
      setResults(data.generated ?? []);
    } catch (err) {
      toast({
        title: "Generation failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleCreatePosts() {
    if (results.length === 0) return;
    setIsCreating(true);
    try {
      const res = await fetch("/api/ai/bulk-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topics,
          platforms: selectedPlatforms,
          tone: tone || undefined,
          createPosts: true,
          campaignName: campaignName || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Creation failed");
      }
      const data = (await res.json()) as { createdPostIds?: string[]; campaignId?: string };
      toast({
        title: `Created ${data.createdPostIds?.length ?? 0} draft posts`,
        description: data.campaignId ? `Added to campaign "${campaignName}"` : undefined,
      });
      onOpenChange(false);
      setResults([]);
      setTopicsText("");
      setCampaignName("");
      onCreated?.();
    } catch (err) {
      toast({
        title: "Creation failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  }

  async function copyContent(content: string, index: number) {
    await navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  }

  const strictestLimit = selectedPlatforms.reduce((min, p) => {
    const limit = PLATFORM_CHAR_LIMITS[p as Platform] ?? 63206;
    return Math.min(min, limit);
  }, 63206);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5" />
            Bulk Generate Posts
          </DialogTitle>
          <DialogDescription>
            Enter topics (one per line) and AI will generate a unique post for each.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Topics */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label>Topics (one per line)</Label>
              <span className={`text-xs ${topics.length > 20 ? "text-red-500" : "text-muted-foreground"}`}>
                {topics.length}/20
              </span>
            </div>
            <Textarea
              value={topicsText}
              onChange={(e) => setTopicsText(e.target.value)}
              placeholder={"Summer sale announcement\nBehind the scenes at our workshop\nCustomer success story"}
              rows={5}
              className="font-mono text-sm"
            />
          </div>

          {/* Platforms */}
          <div className="space-y-1">
            <Label>Platforms</Label>
            <div className="flex flex-wrap gap-2">
              {ALL_PLATFORMS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePlatform(p)}
                  className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${
                    selectedPlatforms.includes(p)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:border-primary"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Tone */}
          <div className="space-y-1">
            <Label>Tone</Label>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {TONE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Generate Button */}
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || topics.length === 0 || selectedPlatforms.length === 0}
            className="w-full"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating {topics.length} post{topics.length !== 1 ? "s" : ""}…
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4 mr-2" />
                Generate {topics.length > 0 ? `${topics.length} ` : ""}Post{topics.length !== 1 ? "s" : ""}
              </>
            )}
          </Button>

          {/* Results */}
          {results.length > 0 && (
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm">{results.length} generated posts</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleGenerate}
                  disabled={isGenerating}
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Regenerate
                </Button>
              </div>

              {results.map((item, index) => {
                const isOverLimit = item.charCount > strictestLimit;
                return (
                  <div key={index} className="border rounded-md p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-medium text-muted-foreground truncate">
                        Topic: {item.topic}
                      </p>
                      <div className="flex items-center gap-1 shrink-0">
                        <span
                          className={`text-xs ${isOverLimit ? "text-red-500" : "text-muted-foreground"}`}
                        >
                          {item.charCount}
                          {strictestLimit < 63206 ? `/${strictestLimit}` : ""}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => copyContent(item.content, index)}
                        >
                          {copiedIndex === index ? (
                            <Check className="h-3 w-3 text-green-500" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{item.content}</p>
                  </div>
                );
              })}

              {/* Campaign Name */}
              <div className="space-y-1">
                <Label className="text-sm">Campaign name (optional)</Label>
                <Input
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="Group all posts into a campaign…"
                />
              </div>

              {/* Create Posts CTA */}
              <Button
                onClick={handleCreatePosts}
                disabled={isCreating}
                className="w-full"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating posts…
                  </>
                ) : (
                  <>
                    Create {results.length} Draft Post{results.length !== 1 ? "s" : ""}
                    {campaignName ? ` in "${campaignName}"` : ""}
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
