"use client";

import { useState } from "react";
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
import {
  Layers,
  RefreshCw,
  Loader2,
  Plus,
  Check,
  Copy,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ContentSeriesPost {
  postNumber: number;
  title: string;
  content: string;
  hookLine: string;
  schedulingTip: string;
  keyTakeaway: string;
}

interface ContentSeriesResult {
  seriesTitle: string;
  description: string;
  posts: ContentSeriesPost[];
}

interface ContentSeriesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedPlatforms: string[];
  onApply?: (content: string) => void;
}

const TONE_OPTIONS = [
  { value: "", label: "Default" },
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual" },
  { value: "educational", label: "Educational" },
  { value: "entertaining", label: "Entertaining" },
  { value: "inspirational", label: "Inspirational" },
  { value: "conversational", label: "Conversational" },
];

const SERIES_TYPE_OPTIONS = [
  { value: "educational", label: "Educational Series" },
  { value: "storytelling", label: "Storytelling Arc" },
  { value: "tips", label: "Tips & Tricks" },
  { value: "how-to", label: "Step-by-Step How-To" },
  { value: "behind-the-scenes", label: "Behind the Scenes" },
  { value: "product", label: "Product Showcase" },
  { value: "challenges", label: "Challenge Series" },
  { value: "interviews", label: "Interview Series" },
];

export function ContentSeriesDialog({
  open,
  onOpenChange,
  selectedPlatforms,
  onApply,
}: ContentSeriesDialogProps) {
  const [topic, setTopic] = useState("");
  const [postCount, setPostCount] = useState(5);
  const [tone, setTone] = useState("");
  const [seriesType, setSeriesType] = useState("educational");
  const [campaignName, setCampaignName] = useState("");
  const [createAsCampaign, setCreateAsCampaign] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [series, setSeries] = useState<ContentSeriesResult | null>(null);
  const [expandedPost, setExpandedPost] = useState<number | null>(0);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const handleGenerate = async () => {
    if (!topic.trim()) {
      toast({ title: "Enter a topic", variant: "destructive" });
      return;
    }
    setLoading(true);
    setSeries(null);
    try {
      const res = await fetch("/api/ai/content-series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          postCount,
          platforms: selectedPlatforms.length > 0 ? selectedPlatforms : ["FACEBOOK"],
          tone: tone || undefined,
          seriesType,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Failed to generate series");
      }
      const data = await res.json() as { series: ContentSeriesResult };
      setSeries(data.series);
      setExpandedPost(0);
    } catch (e) {
      toast({
        title: "Generation failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePosts = async () => {
    if (!series) return;
    setCreating(true);
    try {
      const res = await fetch("/api/ai/content-series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          postCount,
          platforms: selectedPlatforms.length > 0 ? selectedPlatforms : ["FACEBOOK"],
          tone: tone || undefined,
          seriesType,
          createPosts: true,
          campaignName: createAsCampaign
            ? campaignName || series.seriesTitle
            : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Failed to create posts");
      }
      const data = await res.json() as { createdPostIds: string[]; campaignId?: string };
      toast({
        title: "Series created!",
        description: `${data.createdPostIds.length} draft posts created${data.campaignId ? " and linked to a campaign" : ""}.`,
      });
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Creation failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async (content: string, idx: number) => {
    await navigator.clipboard.writeText(content);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            AI Content Series Planner
          </DialogTitle>
          <DialogDescription>
            Generate a cohesive multi-part content series around a single topic.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="series-topic">Topic *</Label>
            <Input
              id="series-topic"
              placeholder="e.g. 10x your Instagram engagement, Building a morning routine..."
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="post-count">
                Number of posts: <span className="font-semibold">{postCount}</span>
              </Label>
              <input
                id="post-count"
                type="range"
                min={2}
                max={10}
                value={postCount}
                onChange={(e) => setPostCount(Number(e.target.value))}
                disabled={loading}
                className="w-full mt-1"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>2</span>
                <span>10</span>
              </div>
            </div>

            <div>
              <Label htmlFor="series-type">Series type</Label>
              <select
                id="series-type"
                value={seriesType}
                onChange={(e) => setSeriesType(e.target.value)}
                disabled={loading}
                className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background"
              >
                {SERIES_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor="series-tone">Tone</Label>
            <select
              id="series-tone"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              disabled={loading}
              className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background"
            >
              {TONE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={loading || !topic.trim()}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating series…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate Series
              </>
            )}
          </Button>

          {series && (
            <div className="space-y-4">
              <div className="border rounded-lg p-4 bg-muted/30">
                <h3 className="font-semibold text-lg">{series.seriesTitle}</h3>
                <p className="text-sm text-muted-foreground mt-1">{series.description}</p>
                <div className="text-xs text-muted-foreground mt-2">
                  {series.posts.length} posts in this series
                </div>
              </div>

              <div className="space-y-2">
                {series.posts.map((post, idx) => (
                  <div key={idx} className="border rounded-lg overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/50 transition-colors"
                      onClick={() =>
                        setExpandedPost(expandedPost === idx ? null : idx)
                      }
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary text-sm font-semibold flex items-center justify-center">
                          {post.postNumber}
                        </span>
                        <div>
                          <div className="font-medium text-sm">{post.title}</div>
                          <div className="text-xs text-muted-foreground truncate max-w-xs">
                            {post.hookLine}
                          </div>
                        </div>
                      </div>
                      {expandedPost === idx ? (
                        <ChevronUp className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      )}
                    </button>

                    {expandedPost === idx && (
                      <div className="p-3 border-t bg-muted/20 space-y-3">
                        <div>
                          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                            Content
                          </div>
                          <div className="text-sm whitespace-pre-wrap bg-background border rounded p-2 max-h-40 overflow-y-auto">
                            {post.content}
                          </div>
                        </div>

                        {post.keyTakeaway && (
                          <div>
                            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                              Key Takeaway
                            </div>
                            <div className="text-sm text-muted-foreground italic">
                              {post.keyTakeaway}
                            </div>
                          </div>
                        )}

                        {post.schedulingTip && (
                          <div className="text-xs text-blue-600 dark:text-blue-400">
                            📅 {post.schedulingTip}
                          </div>
                        )}

                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCopy(post.content, idx)}
                          >
                            {copiedIdx === idx ? (
                              <Check className="h-3 w-3 mr-1" />
                            ) : (
                              <Copy className="h-3 w-3 mr-1" />
                            )}
                            Copy
                          </Button>
                          {onApply && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                onApply(post.content);
                                onOpenChange(false);
                              }}
                            >
                              Use in Composer
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
                <div className="flex items-center gap-2">
                  <input
                    id="create-campaign"
                    type="checkbox"
                    checked={createAsCampaign}
                    onChange={(e) => setCreateAsCampaign(e.target.checked)}
                    className="h-4 w-4 rounded"
                  />
                  <Label htmlFor="create-campaign" className="cursor-pointer">
                    Create as Campaign
                  </Label>
                </div>

                {createAsCampaign && (
                  <div>
                    <Label htmlFor="campaign-name">Campaign name</Label>
                    <Input
                      id="campaign-name"
                      placeholder={series.seriesTitle}
                      value={campaignName}
                      onChange={(e) => setCampaignName(e.target.value)}
                    />
                  </div>
                )}

                <Button
                  onClick={handleCreatePosts}
                  disabled={creating}
                  className="w-full"
                >
                  {creating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating posts…
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Create {series.posts.length} Draft Posts
                    </>
                  )}
                </Button>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleGenerate}
                disabled={loading}
                className="w-full"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Regenerate
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
