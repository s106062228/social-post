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
import { Scissors, Loader2, Copy, Check, RefreshCw, Lightbulb } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface AtomizedPost {
  content: string;
  keyTakeaway: string;
  suggestedPlatforms: string[];
}

interface AtomizeResult {
  posts: AtomizedPost[];
  summary: string;
  sourceTitle?: string;
}

interface ContentAtomizeDialogProps {
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

const POST_COUNT_OPTIONS = [3, 5, 7, 10, 15, 20];

export function ContentAtomizeDialog({
  open,
  onOpenChange,
  onCreated,
}: ContentAtomizeDialogProps) {
  const [longFormContent, setLongFormContent] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([
    "FACEBOOK",
    "INSTAGRAM",
    "LINKEDIN",
  ]);
  const [targetPostCount, setTargetPostCount] = useState(7);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [result, setResult] = useState<AtomizeResult | null>(null);
  const [campaignName, setCampaignName] = useState("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const contentLength = longFormContent.length;
  const MAX_LENGTH = 50000;

  function togglePlatform(platform: string) {
    setSelectedPlatforms((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform]
    );
  }

  async function handleAtomize() {
    if (contentLength < 100) {
      toast({ title: "Content must be at least 100 characters", variant: "destructive" });
      return;
    }
    if (contentLength > MAX_LENGTH) {
      toast({ title: "Content exceeds 50,000 character limit", variant: "destructive" });
      return;
    }
    if (selectedPlatforms.length === 0) {
      toast({ title: "Select at least one platform", variant: "destructive" });
      return;
    }

    setIsGenerating(true);
    setResult(null);
    try {
      const res = await fetch("/api/ai/atomize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: longFormContent,
          platforms: selectedPlatforms,
          targetPostCount,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Atomization failed");
      }
      const data = (await res.json()) as AtomizeResult;
      setResult(data);
    } catch (err) {
      toast({
        title: "Atomization failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleCreatePosts() {
    if (!result || result.posts.length === 0) return;
    setIsCreating(true);
    try {
      const res = await fetch("/api/ai/atomize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: longFormContent,
          platforms: selectedPlatforms,
          targetPostCount,
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
      setResult(null);
      setLongFormContent("");
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="h-5 w-5" />
            Atomize Long-Form Content
          </DialogTitle>
          <DialogDescription>
            Paste an article, blog post, or essay and AI will break it into a series of social media posts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Long-form content input */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label>Long-form content</Label>
              <span
                className={`text-xs ${
                  contentLength > MAX_LENGTH
                    ? "text-red-500"
                    : contentLength > MAX_LENGTH * 0.9
                    ? "text-yellow-500"
                    : "text-muted-foreground"
                }`}
              >
                {contentLength.toLocaleString()}/{MAX_LENGTH.toLocaleString()} chars
              </span>
            </div>
            <Textarea
              value={longFormContent}
              onChange={(e) => setLongFormContent(e.target.value)}
              placeholder="Paste your article, blog post, newsletter, or any long-form content here…"
              rows={8}
              className="font-mono text-sm resize-none"
              maxLength={MAX_LENGTH}
            />
          </div>

          {/* Platform selector */}
          <div className="space-y-1">
            <Label>Target platforms</Label>
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

          {/* Post count */}
          <div className="space-y-1">
            <Label>Number of posts to generate</Label>
            <div className="flex flex-wrap gap-2">
              {POST_COUNT_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setTargetPostCount(n)}
                  className={`px-3 py-1.5 rounded text-sm font-medium border transition-colors ${
                    targetPostCount === n
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:border-primary"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Atomize button */}
          <Button
            onClick={handleAtomize}
            disabled={
              isGenerating ||
              contentLength < 100 ||
              contentLength > MAX_LENGTH ||
              selectedPlatforms.length === 0
            }
            className="w-full"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Atomizing content into {targetPostCount} posts…
              </>
            ) : (
              <>
                <Scissors className="h-4 w-4 mr-2" />
                Atomize into {targetPostCount} Posts
              </>
            )}
          </Button>

          {/* Results */}
          {result && result.posts.length > 0 && (
            <div className="space-y-4 pt-2 border-t">
              {/* Summary */}
              {(result.sourceTitle || result.summary) && (
                <div className="rounded-md bg-muted p-3 space-y-1">
                  {result.sourceTitle && (
                    <p className="text-sm font-semibold">{result.sourceTitle}</p>
                  )}
                  {result.summary && (
                    <p className="text-xs text-muted-foreground">{result.summary}</p>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm">
                  {result.posts.length} atomized posts
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleAtomize}
                  disabled={isGenerating}
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Regenerate
                </Button>
              </div>

              <div className="space-y-3">
                {result.posts.map((item, index) => (
                  <div key={index} className="border rounded-md p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-semibold text-muted-foreground">
                        Post {index + 1}
                      </span>
                      <div className="flex items-center gap-2">
                        {/* Suggested platforms */}
                        <div className="flex gap-1">
                          {item.suggestedPlatforms.slice(0, 3).map((p) => (
                            <span
                              key={p}
                              className="text-xs bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded"
                            >
                              {p.charAt(0) + p.slice(1).toLowerCase()}
                            </span>
                          ))}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {item.content.length} chars
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

                    {item.keyTakeaway && (
                      <div className="flex items-start gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded p-2">
                        <Lightbulb className="h-3 w-3 shrink-0 mt-0.5 text-yellow-500" />
                        <span>{item.keyTakeaway}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Campaign option */}
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
                    Create {result.posts.length} Draft Post
                    {result.posts.length !== 1 ? "s" : ""}
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
