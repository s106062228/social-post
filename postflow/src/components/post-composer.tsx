"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { Platform } from "@prisma/client";

interface Account {
  id: string;
  accountName: string;
  platform: Platform;
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

  const charCount = content.length;
  const maxChars = 63206;

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

      {/* Content */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="content">Post content</Label>
          <span
            className={
              charCount > maxChars
                ? "text-xs text-destructive"
                : "text-xs text-muted-foreground"
            }
          >
            {charCount}/{maxChars}
          </span>
        </div>
        <Textarea
          id="content"
          placeholder="What do you want to share?"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="min-h-[160px] resize-none"
        />
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
      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => savePost(false)}
          disabled={saving || publishing || !content.trim()}
        >
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {scheduledAt ? "Schedule" : "Save draft"}
        </Button>
        <Button
          type="button"
          onClick={() => savePost(true)}
          disabled={
            saving ||
            publishing ||
            !content.trim() ||
            selectedAccountIds.size === 0
          }
        >
          {publishing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Publish now
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={saving || publishing}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
