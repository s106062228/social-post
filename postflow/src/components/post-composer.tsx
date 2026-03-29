"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

type MediaType = "NONE" | "IMAGE" | "VIDEO" | "CAROUSEL";

interface PostComposerProps {
  defaultScheduledAt?: string;
}

export function PostComposer({ defaultScheduledAt }: PostComposerProps) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [mediaType] = useState<MediaType>("NONE");
  const [scheduledAt, setScheduledAt] = useState(defaultScheduledAt ?? "");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const charCount = content.length;
  const maxChars = 63206;

  async function savePost(publish: boolean) {
    setError(null);
    if (publish) {
      setPublishing(true);
    } else {
      setSaving(true);
    }

    try {
      const body: Record<string, unknown> = {
        content,
        mediaType,
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
          body: JSON.stringify({ postId: post.id }),
        });
        if (!pubRes.ok) {
          const pubData = (await pubRes.json()) as { error?: string };
          throw new Error(pubData.error ?? "Failed to publish post");
        }
      }

      router.push("/posts");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSaving(false);
      setPublishing(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
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

      {/* Error */}
      {error && (
        <p className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

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
          disabled={saving || publishing || !content.trim()}
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
