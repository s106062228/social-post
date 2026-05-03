"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, Eye, EyeOff, ListOrdered, Sparkles, Hash, Bell, MessageCirclePlus } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { TagSelector } from "@/components/tag-selector";
import { PlatformCharCounter } from "@/components/platform-char-counter";
import { PostPreview } from "@/components/post-preview";
import { PlatformVariants, type PlatformVariantData } from "@/components/platform-variants";
import { LinkPreviewCard } from "@/components/link-preview-card";
import { ReadabilityIndicator } from "@/components/readability-indicator";
import { isContentOverLimitForAny } from "@/lib/character-limits";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { Platform } from "@prisma/client";

interface Account {
  id: string;
  accountName: string;
  platform: Platform;
}

interface Template {
  id: string;
  name: string;
  content: string;
}

interface HashtagGroup {
  id: string;
  name: string;
  hashtags: string[];
}

interface PostComposerProps {
  defaultScheduledAt?: string;
  accounts: Account[];
}

const PLATFORM_LABELS: Record<Platform, string> = {
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  THREADS: "Threads",
};

export function PostComposer({ defaultScheduledAt, accounts }: PostComposerProps) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [scheduledAt, setScheduledAt] = useState(defaultScheduledAt ?? "");
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(
    () => new Set(accounts.map((a) => a.id))
  );
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [queuing, setQueuing] = useState(false);
  const [reminderMinutes, setReminderMinutes] = useState<number | null>(null);
  const [firstComment, setFirstComment] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [hashtagGroups, setHashtagGroups] = useState<HashtagGroup[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [platformVariants, setPlatformVariants] = useState<PlatformVariantData[]>([]);

  // AI suggestions state
  const [showAiDialog, setShowAiDialog] = useState(false);
  const [aiTopic, setAiTopic] = useState("");
  const [aiTone, setAiTone] = useState("professional");
  const [aiVariants, setAiVariants] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [hashtagsLoading, setHashtagsLoading] = useState(false);

  useEffect(() => {
    fetch("/api/templates?limit=50")
      .then((r) => r.json())
      .then((data: { templates?: Template[] }) => {
        if (data.templates) setTemplates(data.templates);
      })
      .catch(() => undefined);

    fetch("/api/hashtags")
      .then((r) => r.json())
      .then((data: { groups?: HashtagGroup[] }) => {
        if (data.groups) setHashtagGroups(data.groups);
      })
      .catch(() => undefined);
  }, []);

  const selectedPlatforms = accounts
    .filter((a) => selectedAccountIds.has(a.id))
    .map((a) => a.platform);

  const overLimit = isContentOverLimitForAny(content, selectedPlatforms);

  function toggleAccount(id: string) {
    setSelectedAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function savePost(publish: boolean) {
    if (publish && selectedAccountIds.size === 0) {
      toast({ title: "Select at least one account to publish to.", variant: "destructive" });
      return;
    }

    if (overLimit) {
      toast({
        title: "Content exceeds platform character limit",
        description: "Shorten your post before publishing.",
        variant: "destructive",
      });
      return;
    }

    if (publish) {
      setPublishing(true);
    } else {
      setSaving(true);
    }

    try {
      const body: Record<string, unknown> = {
        content,
        mediaType: "NONE",
        mediaUrls: [],
        tagIds: selectedTagIds,
      };
      if (scheduledAt) {
        body.scheduledAt = new Date(scheduledAt).toISOString();
        if (reminderMinutes !== null) {
          body.reminderMinutes = reminderMinutes;
        }
      }
      if (firstComment.trim()) {
        body.firstComment = firstComment.trim();
      }

      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to save post");
      }

      const post = (await res.json()) as { id: string };

      // Save platform-specific variants if any are enabled
      const enabledVariants = platformVariants.filter((v) => v.enabled && v.content.trim());
      if (enabledVariants.length > 0) {
        await fetch(`/api/posts/${post.id}/variants`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            variants: enabledVariants.map((v) => ({
              platform: v.platform,
              content: v.content,
              mediaType: "NONE",
              mediaUrls: [],
            })),
          }),
        });
      }

      if (publish) {
        const pubRes = await fetch("/api/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            postId: post.id,
            accountIds: Array.from(selectedAccountIds),
          }),
        });
        if (!pubRes.ok) {
          const pubData = (await pubRes.json()) as { error?: string };
          throw new Error(pubData.error ?? "Failed to publish post");
        }
        toast({ title: "Post published", variant: "success" });
      } else if (scheduledAt) {
        toast({ title: "Post scheduled", variant: "success" });
      } else {
        toast({ title: "Draft saved", variant: "success" });
      }

      router.push("/posts");
      router.refresh();
    } catch (err) {
      toast({
        title: "Something went wrong",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
      setPublishing(false);
    }
  }

  async function addToQueue() {
    if (!content.trim()) {
      toast({ title: "Post content cannot be empty.", variant: "destructive" });
      return;
    }
    if (overLimit) {
      toast({
        title: "Content exceeds platform character limit",
        description: "Shorten your post before queuing.",
        variant: "destructive",
      });
      return;
    }

    setQueuing(true);
    try {
      const saveRes = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          mediaType: "NONE",
          mediaUrls: [],
          tagIds: selectedTagIds,
        }),
      });
      if (!saveRes.ok) {
        const data = (await saveRes.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to save post");
      }
      const post = (await saveRes.json()) as { id: string };

      const queueRes = await fetch(`/api/posts/${post.id}/queue`, { method: "POST" });
      if (!queueRes.ok) {
        const data = (await queueRes.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to add to queue");
      }
      const queued = (await queueRes.json()) as { scheduledAt?: string };

      toast({
        title: "Added to queue",
        description: queued.scheduledAt
          ? `Scheduled for ${new Date(queued.scheduledAt).toLocaleString()}`
          : "Post scheduled",
        variant: "success",
      });
      router.push("/posts");
      router.refresh();
    } catch (err) {
      toast({
        title: "Failed to add to queue",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setQueuing(false);
    }
  }

  async function fetchAiVariants() {
    if (!aiTopic.trim()) {
      toast({ title: "Enter a topic first.", variant: "destructive" });
      return;
    }
    setAiLoading(true);
    setAiVariants([]);
    try {
      const res = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: aiTopic,
          tone: aiTone,
          platforms: selectedPlatforms.length > 0 ? selectedPlatforms : ["FACEBOOK"],
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to generate suggestions");
      }
      const data = (await res.json()) as { variants: string[] };
      setAiVariants(data.variants);
    } catch (err) {
      toast({
        title: "AI suggestions failed",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setAiLoading(false);
    }
  }

  async function fetchHashtagSuggestions() {
    if (!content.trim()) {
      toast({ title: "Add post content first.", variant: "destructive" });
      return;
    }
    setHashtagsLoading(true);
    try {
      const res = await fetch("/api/ai/hashtags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          platforms: selectedPlatforms.length > 0 ? selectedPlatforms : ["FACEBOOK"],
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to suggest hashtags");
      }
      const data = (await res.json()) as { hashtags: string[] };
      if (data.hashtags.length > 0) {
        const suffix = data.hashtags.join(" ");
        setContent((prev) =>
          prev.trim() ? `${prev.trimEnd()}\n\n${suffix}` : suffix
        );
        toast({ title: "Hashtags added", variant: "success" });
      }
    } catch (err) {
      toast({
        title: "Hashtag suggestions failed",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setHashtagsLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Account selection */}
      <div className="flex flex-col gap-2">
        <Label>Publish to</Label>
        <div className="flex flex-wrap gap-2">
          {accounts.map((account) => {
            const selected = selectedAccountIds.has(account.id);
            return (
              <button
                key={account.id}
                type="button"
                onClick={() => toggleAccount(account.id)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors ${
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background text-foreground hover:bg-muted"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    selected ? "bg-primary-foreground" : "bg-muted-foreground"
                  }`}
                />
                {account.accountName}
                <span className="opacity-70">
                  · {PLATFORM_LABELS[account.platform]}
                </span>
              </button>
            );
          })}
        </div>
        {selectedAccountIds.size === 0 && (
          <p className="text-xs text-muted-foreground">
            No accounts selected — post will be saved as draft only.
          </p>
        )}
      </div>

      {/* Template selector */}
      {templates.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="template-select">Load from template</Label>
          <select
            id="template-select"
            className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            defaultValue=""
            onChange={(e) => {
              const tpl = templates.find((t) => t.id === e.target.value);
              if (tpl) {
                setContent(tpl.content);
                e.target.value = "";
              }
            }}
          >
            <option value="" disabled>Select a template…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Hashtag group insertion */}
      {hashtagGroups.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="hashtag-group-select">Insert hashtag group</Label>
          <select
            id="hashtag-group-select"
            className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            defaultValue=""
            onChange={(e) => {
              const group = hashtagGroups.find((g) => g.id === e.target.value);
              if (group) {
                const suffix = group.hashtags.join(" ");
                setContent((prev) =>
                  prev.trim() ? `${prev.trimEnd()}\n\n${suffix}` : suffix
                );
                e.target.value = "";
              }
            }}
          >
            <option value="" disabled>Select a hashtag group…</option>
            {hashtagGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ({g.hashtags.length})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Tags */}
      <div className="flex flex-col gap-2">
        <Label>Tags</Label>
        <TagSelector selectedTagIds={selectedTagIds} onChange={setSelectedTagIds} />
      </div>

      {/* Content */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="content">Post content</Label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAiDialog(true)}
              className="flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Sparkles className="h-3 w-3" />
              AI Suggest
            </button>
            <button
              type="button"
              onClick={fetchHashtagSuggestions}
              disabled={hashtagsLoading || !content.trim()}
              className="flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:pointer-events-none disabled:opacity-50"
            >
              {hashtagsLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Hash className="h-3 w-3" />
              )}
              Suggest Hashtags
            </button>
          </div>
        </div>
        <Textarea
          id="content"
          placeholder="What do you want to share?"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="min-h-[160px] resize-none"
        />
        {selectedPlatforms.length > 0 && (
          <PlatformCharCounter content={content} platforms={selectedPlatforms} />
        )}
        <ReadabilityIndicator content={content} />
        <LinkPreviewCard content={content} />
      </div>

      {/* First comment — shown when Facebook or Instagram accounts are selected */}
      {selectedPlatforms.some((p) => p === "FACEBOOK" || p === "INSTAGRAM") && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <MessageCirclePlus className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="firstComment">
              First comment{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
          </div>
          <Textarea
            id="firstComment"
            placeholder="Add a comment posted immediately after publishing — great for hashtags."
            value={firstComment}
            onChange={(e) => setFirstComment(e.target.value)}
            className="min-h-[80px] resize-none"
            maxLength={2200}
          />
          {firstComment.length > 0 && (
            <p className="text-xs text-muted-foreground text-right">
              {firstComment.length}/2200
            </p>
          )}
        </div>
      )}

      {/* Per-platform content variants (shown when 2+ platforms are selected) */}
      {selectedPlatforms.length >= 2 && (
        <PlatformVariants
          platforms={selectedPlatforms}
          baseContent={content}
          variants={platformVariants}
          onChange={setPlatformVariants}
        />
      )}

      {/* AI Suggest Dialog */}
      <Dialog open={showAiDialog} onOpenChange={setShowAiDialog}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              AI Content Suggestions
            </DialogTitle>
            <DialogDescription>
              Describe your topic and tone to generate post variants.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ai-topic">Topic</Label>
              <Input
                id="ai-topic"
                placeholder="e.g. new product launch, summer sale, team update…"
                value={aiTopic}
                onChange={(e) => setAiTopic(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void fetchAiVariants();
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ai-tone">Tone</Label>
              <select
                id="ai-tone"
                className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={aiTone}
                onChange={(e) => setAiTone(e.target.value)}
              >
                <option value="professional">Professional</option>
                <option value="casual">Casual</option>
                <option value="enthusiastic">Enthusiastic</option>
                <option value="humorous">Humorous</option>
                <option value="informative">Informative</option>
                <option value="inspirational">Inspirational</option>
              </select>
            </div>
            <Button
              type="button"
              onClick={fetchAiVariants}
              disabled={aiLoading || !aiTopic.trim()}
              className="w-full"
            >
              {aiLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Generate Variants
            </Button>
            {aiVariants.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium text-foreground">Choose a variant:</p>
                {aiVariants.map((variant, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setContent(variant);
                      setShowAiDialog(false);
                    }}
                    className="rounded-md border border-input bg-background p-3 text-left text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    {variant}
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Post preview toggle */}
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {showPreview ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
          {showPreview ? "Hide preview" : "Show preview"}
        </button>
        {showPreview && (
          <PostPreview content={content} platforms={selectedPlatforms} />
        )}
      </div>

      {/* Schedule */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="scheduledAt">
          Schedule for{" "}
          <span className="text-muted-foreground font-normal">
            (leave empty to save as draft)
          </span>
        </Label>
        <Input
          id="scheduledAt"
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => {
            setScheduledAt(e.target.value);
            if (!e.target.value) setReminderMinutes(null);
          }}
        />
      </div>

      {/* Reminder — only shown when a scheduled time is set */}
      {scheduledAt && (
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-muted-foreground shrink-0" />
          <Label htmlFor="reminderMinutes" className="shrink-0">
            Remind me
          </Label>
          <select
            id="reminderMinutes"
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={reminderMinutes ?? ""}
            onChange={(e) =>
              setReminderMinutes(e.target.value ? Number(e.target.value) : null)
            }
          >
            <option value="">No reminder</option>
            <option value="30">30 minutes before</option>
            <option value="60">1 hour before</option>
            <option value="180">3 hours before</option>
            <option value="1440">1 day before</option>
          </select>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => savePost(false)}
          disabled={saving || publishing || queuing || !content.trim()}
        >
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {scheduledAt ? "Schedule" : "Save draft"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={addToQueue}
          disabled={saving || publishing || queuing || !content.trim() || overLimit}
          title="Save and schedule to next available queue slot"
        >
          {queuing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <ListOrdered className="mr-2 h-4 w-4" />
          )}
          Add to queue
        </Button>
        <Button
          type="button"
          onClick={() => savePost(true)}
          disabled={
            saving ||
            publishing ||
            queuing ||
            !content.trim() ||
            selectedAccountIds.size === 0 ||
            overLimit
          }
        >
          {publishing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Publish now
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={saving || publishing || queuing}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
