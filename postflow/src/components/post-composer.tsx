"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ImagePlus, X, Loader2 } from "lucide-react";

type MediaType = "NONE" | "IMAGE" | "VIDEO" | "CAROUSEL";

interface MediaItem {
  key: string;
  publicUrl: string;
  mimeType: string;
  previewUrl: string; // object URL for local preview
}

interface PostComposerProps {
  defaultScheduledAt?: string;
}

const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const MAX_MEDIA_ITEMS = 10; // Instagram carousel limit

function deriveMediaType(items: MediaItem[]): MediaType {
  if (items.length === 0) return "NONE";
  if (items.length > 1) return "CAROUSEL";
  return ALLOWED_VIDEO_TYPES.includes(items[0].mimeType) ? "VIDEO" : "IMAGE";
}

export function PostComposer({ defaultScheduledAt }: PostComposerProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [content, setContent] = useState("");
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [scheduledAt, setScheduledAt] = useState(defaultScheduledAt ?? "");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const charCount = content.length;
  const maxChars = 63206;
  const isUploading = uploadingCount > 0;

  // ── Media upload ──────────────────────────────────────────────────────────

  async function uploadFile(file: File): Promise<MediaItem | null> {
    // 1. Get a presigned PUT URL from our API
    const metaRes = await fetch("/api/media/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, mimeType: file.type }),
    });

    if (!metaRes.ok) {
      const data = (await metaRes.json()) as { error?: string };
      throw new Error(data.error ?? "Failed to request upload URL");
    }

    const { key, uploadUrl, publicUrl } = (await metaRes.json()) as {
      key: string;
      uploadUrl: string;
      publicUrl: string;
    };

    // 2. PUT the file bytes directly to R2
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });

    if (!putRes.ok) {
      throw new Error("Failed to upload file to storage");
    }

    return {
      key,
      publicUrl,
      mimeType: file.type,
      previewUrl: URL.createObjectURL(file),
    };
  }

  async function handleFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return;

    const remaining = MAX_MEDIA_ITEMS - mediaItems.length;
    const toUpload = Array.from(files).slice(0, remaining);

    if (toUpload.length === 0) {
      setError(`Maximum ${MAX_MEDIA_ITEMS} media items allowed`);
      return;
    }

    setError(null);
    setUploadingCount((n) => n + toUpload.length);

    const results = await Promise.allSettled(toUpload.map(uploadFile));

    const uploaded: MediaItem[] = [];
    const errors: string[] = [];

    results.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value) {
        uploaded.push(r.value);
      } else if (r.status === "rejected") {
        errors.push(`${toUpload[i].name}: ${(r.reason as Error).message}`);
      }
    });

    setMediaItems((prev) => [...prev, ...uploaded]);
    setUploadingCount((n) => n - toUpload.length);

    if (errors.length > 0) {
      setError(errors.join("; "));
    }
  }

  async function removeMedia(index: number) {
    const item = mediaItems[index];

    // Best-effort delete from R2 (non-blocking)
    fetch("/api/media/upload", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: item.key }),
    }).catch(() => undefined);

    // Release the local object URL
    URL.revokeObjectURL(item.previewUrl);

    setMediaItems((prev) => prev.filter((_, i) => i !== index));
  }

  // ── Save / publish ────────────────────────────────────────────────────────

  async function savePost(publish: boolean) {
    setError(null);
    if (publish) setPublishing(true);
    else setSaving(true);

    try {
      const mediaType = deriveMediaType(mediaItems);

      const body: Record<string, unknown> = {
        content,
        mediaType,
        mediaUrls: mediaItems.map((m) => m.publicUrl),
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

  // ── Render ────────────────────────────────────────────────────────────────

  const mediaType = deriveMediaType(mediaItems);
  const canAddMore =
    mediaItems.length < MAX_MEDIA_ITEMS &&
    (mediaType === "NONE" || mediaType === "IMAGE" || mediaType === "CAROUSEL");

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

      {/* Media */}
      <div className="flex flex-col gap-3">
        <Label>
          Media{" "}
          <span className="text-muted-foreground font-normal">
            (optional — images or video)
          </span>
        </Label>

        {/* Preview grid */}
        {mediaItems.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {mediaItems.map((item, i) => (
              <div key={item.key} className="relative aspect-square overflow-hidden rounded-md border bg-muted">
                {ALLOWED_VIDEO_TYPES.includes(item.mimeType) ? (
                  <video
                    src={item.previewUrl}
                    className="h-full w-full object-cover"
                    muted
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.previewUrl}
                    alt={`Media ${i + 1}`}
                    className="h-full w-full object-cover"
                  />
                )}
                <button
                  type="button"
                  onClick={() => removeMedia(i)}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                  aria-label="Remove media"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}

            {/* Uploading placeholders */}
            {Array.from({ length: uploadingCount }).map((_, i) => (
              <div
                key={`uploading-${i}`}
                className="flex aspect-square items-center justify-center rounded-md border bg-muted"
              >
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ))}
          </div>
        )}

        {/* Add media button — only shown when more media can be added (not for single-video posts) */}
        {canAddMore && (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="mr-2 h-4 w-4" />
              )}
              {mediaItems.length === 0 ? "Add media" : "Add more"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm"
              multiple={true}
              className="hidden"
              onChange={(e) => handleFilesSelected(e.target.files)}
            />
          </div>
        )}

        {mediaType !== "NONE" && (
          <p className="text-xs text-muted-foreground">
            {mediaType === "VIDEO"
              ? "Video post — only one video allowed"
              : mediaType === "CAROUSEL"
              ? `Carousel post — ${mediaItems.length}/${MAX_MEDIA_ITEMS} images`
              : "Image post — add more images to create a carousel"}
          </p>
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
          disabled={saving || publishing || isUploading || !content.trim()}
        >
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {scheduledAt ? "Schedule" : "Save draft"}
        </Button>
        <Button
          type="button"
          onClick={() => savePost(true)}
          disabled={saving || publishing || isUploading || !content.trim()}
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
