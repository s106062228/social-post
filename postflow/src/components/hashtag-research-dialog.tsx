"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Search, Hash, X, BookmarkPlus } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface HashtagResult {
  tag: string;
  category: "niche" | "medium" | "popular";
  estimatedReach: "low" | "medium" | "high";
  relevanceScore: number;
}

interface HashtagResearchDialogProps {
  open: boolean;
  onClose: () => void;
  onInsert: (hashtags: string[]) => void;
  selectedPlatforms?: string[];
}

const PLATFORMS = [
  "FACEBOOK",
  "INSTAGRAM",
  "THREADS",
  "TWITTER",
  "LINKEDIN",
  "TIKTOK",
  "BLUESKY",
  "MASTODON",
];

const CATEGORY_CONFIG = {
  popular: {
    label: "Popular",
    color:
      "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    description: ">1M posts",
  },
  medium: {
    label: "Medium",
    color:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    description: "100K–1M posts",
  },
  niche: {
    label: "Niche",
    color:
      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    description: "<100K posts",
  },
};

const REACH_CONFIG = {
  high: { label: "High Reach", color: "text-green-600 dark:text-green-400" },
  medium: {
    label: "Med. Reach",
    color: "text-yellow-600 dark:text-yellow-400",
  },
  low: { label: "Low Reach", color: "text-muted-foreground" },
};

export function HashtagResearchDialog({
  open,
  onClose,
  onInsert,
  selectedPlatforms = [],
}: HashtagResearchDialogProps) {
  const [topic, setTopic] = useState("");
  const [platforms, setPlatforms] = useState<string[]>(
    selectedPlatforms.length > 0 ? selectedPlatforms : ["INSTAGRAM"]
  );
  const [count, setCount] = useState(20);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<HashtagResult[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [savingGroup, setSavingGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [showSaveForm, setShowSaveForm] = useState(false);

  const togglePlatform = useCallback((platform: string) => {
    setPlatforms((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform]
    );
  }, []);

  const toggleTag = useCallback((tag: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }, []);

  const handleResearch = async () => {
    if (!topic.trim() || platforms.length === 0) return;
    setLoading(true);
    setResults(null);
    setSelected(new Set());
    try {
      const res = await fetch("/api/ai/research-hashtags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim(), platforms, count }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Research failed");
      }
      const data = (await res.json()) as { hashtags: HashtagResult[] };
      setResults(data.hashtags);
    } catch (err) {
      toast({
        title: "Research failed",
        description:
          err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInsert = () => {
    if (selected.size === 0) return;
    onInsert(Array.from(selected));
    toast({
      title: `${selected.size} hashtag${selected.size !== 1 ? "s" : ""} inserted`,
      variant: "success",
    });
    onClose();
  };

  const handleSaveGroup = async () => {
    if (!groupName.trim() || selected.size === 0) return;
    setSavingGroup(true);
    try {
      const res = await fetch("/api/hashtags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: groupName.trim(),
          hashtags: Array.from(selected),
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to save group");
      }
      toast({ title: "Hashtag group saved", variant: "success" });
      setShowSaveForm(false);
      setGroupName("");
    } catch (err) {
      toast({
        title: "Save failed",
        description:
          err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setSavingGroup(false);
    }
  };

  const grouped = results
    ? {
        popular: results.filter((h) => h.category === "popular"),
        medium: results.filter((h) => h.category === "medium"),
        niche: results.filter((h) => h.category === "niche"),
      }
    : null;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Research Hashtags</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm opacity-70 ring-offset-background hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-5">
          {/* Topic input */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="research-topic">Topic</Label>
            <Input
              id="research-topic"
              placeholder="e.g. sustainable fashion, coffee brewing, web development…"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleResearch();
              }}
              maxLength={200}
            />
          </div>

          {/* Platform selector */}
          <div className="flex flex-col gap-1.5">
            <Label>Platforms</Label>
            <div className="flex flex-wrap gap-1.5">
              {PLATFORMS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePlatform(p)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    platforms.includes(p)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {p.charAt(0) + p.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Count slider */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="research-count">
              Number of hashtags: {count}
            </Label>
            <input
              id="research-count"
              type="range"
              min={5}
              max={50}
              step={5}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>5</span>
              <span>50</span>
            </div>
          </div>

          <Button
            onClick={() => void handleResearch()}
            disabled={loading || !topic.trim() || platforms.length === 0}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Researching…
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Research Hashtags
              </>
            )}
          </Button>

          {/* Results */}
          {grouped && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  {results!.length} hashtags found
                  {selected.size > 0 && ` · ${selected.size} selected`}
                </p>
                {results!.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (selected.size === results!.length) {
                        setSelected(new Set());
                      } else {
                        setSelected(new Set(results!.map((h) => h.tag)));
                      }
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    {selected.size === results!.length
                      ? "Deselect all"
                      : "Select all"}
                  </button>
                )}
              </div>

              {(["popular", "medium", "niche"] as const).map((cat) => {
                const items = grouped[cat];
                if (items.length === 0) return null;
                const cfg = CATEGORY_CONFIG[cat];
                return (
                  <div key={cat}>
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${cfg.color}`}
                      >
                        {cfg.label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {cfg.description}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {items.map((h) => {
                        const reachCfg = REACH_CONFIG[h.estimatedReach];
                        const isSelected = selected.has(h.tag);
                        return (
                          <button
                            key={h.tag}
                            type="button"
                            onClick={() => toggleTag(h.tag)}
                            className={`group flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors ${
                              isSelected
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-input bg-background text-foreground hover:border-primary/50"
                            }`}
                            title={`${reachCfg.label} · ${Math.round(h.relevanceScore * 100)}% relevant`}
                          >
                            <Hash className="h-3 w-3 opacity-50" />
                            {h.tag.replace(/^#/, "")}
                            <span className={`text-xs ${reachCfg.color}`}>
                              {Math.round(h.relevanceScore * 100)}%
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Actions */}
              {selected.size > 0 && (
                <div className="flex flex-col gap-3 border-t pt-4">
                  <div className="flex gap-2">
                    <Button onClick={handleInsert} className="flex-1">
                      <Hash className="mr-2 h-4 w-4" />
                      Insert {selected.size} Selected
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowSaveForm(!showSaveForm)}
                    >
                      <BookmarkPlus className="mr-2 h-4 w-4" />
                      Save as Group
                    </Button>
                  </div>

                  {showSaveForm && (
                    <div className="flex gap-2">
                      <Input
                        placeholder="Group name…"
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleSaveGroup();
                        }}
                        maxLength={100}
                      />
                      <Button
                        onClick={() => void handleSaveGroup()}
                        disabled={savingGroup || !groupName.trim()}
                      >
                        {savingGroup ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Save"
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
