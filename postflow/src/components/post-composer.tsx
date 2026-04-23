"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, Eye, EyeOff, ListOrdered } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { TagSelector } from "@/components/tag-selector";
import { PlatformCharCounter } from "@/components/platform-char-counter";
import { PostPreview } from "@/components/post-preview";
import { isContentOverLimitForAny } from "@/lib/character-limits";
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
  const [templates, setTemplates] = useState<Template[]>([]);
  const [hashtagGroups, setHashtagGroups] = useState<HashtagGroup[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);

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
        <Label htmlFor="content">Post content</Label>
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
      </div>

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
          onChange={(e) => setScheduledAt(e.target.value)}
        />
      </div>

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
