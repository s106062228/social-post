"use client";

import { useState } from "react";
import { Globe, Loader2, Copy, Check, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { PLATFORM_CHAR_LIMITS } from "@/lib/character-limits";

interface UrlPost {
  platform: string;
  content: string;
}

interface UrlToPostDialogProps {
  open: boolean;
  onClose: () => void;
  platforms: string[];
  onApply: (text: string) => void;
}

export function UrlToPostDialog({ open, onClose, platforms, onApply }: UrlToPostDialogProps) {
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState("");
  const [loading, setLoading] = useState(false);
  const [posts, setPosts] = useState<UrlPost[]>([]);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  function validateUrl(value: string): boolean {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }

  async function generate() {
    const trimmed = url.trim();
    if (!trimmed) {
      setUrlError("Please enter a URL");
      return;
    }
    if (!validateUrl(trimmed)) {
      setUrlError("Please enter a valid URL (including https://)");
      return;
    }
    setUrlError("");
    setLoading(true);
    try {
      const res = await fetch("/api/ai/post-from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed, platforms: platforms.length ? platforms : ["FACEBOOK"] }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        if (res.status === 422) {
          toast({ title: "Could not fetch URL", description: data.error ?? "Failed to extract content from the URL.", variant: "destructive" });
        } else if (res.status === 503) {
          toast({ title: "AI not configured", description: "ANTHROPIC_API_KEY is not set.", variant: "destructive" });
        } else {
          toast({ title: "Generation failed", description: data.error ?? "Unknown error", variant: "destructive" });
        }
        return;
      }
      const data = (await res.json()) as { posts: UrlPost[] };
      setPosts(data.posts);
    } catch {
      toast({ title: "Error", description: "Network error. Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function copyPost(content: string, idx: number) {
    await navigator.clipboard.writeText(content);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  }

  function getCharLimit(platform: string): number {
    return (PLATFORM_CHAR_LIMITS as Record<string, number>)[platform] ?? 3000;
  }

  function getCharColor(content: string, platform: string) {
    const limit = getCharLimit(platform);
    const len = content.length;
    if (len > limit) return "text-red-500";
    if (len > limit * 0.9) return "text-yellow-500";
    return "text-muted-foreground";
  }

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Generate Posts from URL
          </DialogTitle>
          <DialogDescription>
            Enter a URL and we&apos;ll extract the content and generate platform-optimized posts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="url-input">URL</Label>
            <div className="flex gap-2">
              <Input
                id="url-input"
                type="url"
                placeholder="https://example.com/article"
                value={url}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setUrl(e.target.value); setUrlError(""); }}
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") void generate(); }}
                className={urlError ? "border-red-500" : ""}
              />
              <Button onClick={() => void generate()} disabled={loading} className="shrink-0">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                <span className="ml-2">{posts.length ? "Regenerate" : "Fetch & Generate"}</span>
              </Button>
            </div>
            {urlError && <p className="text-sm text-red-500">{urlError}</p>}
          </div>

          {loading && (
            <div className="text-center py-8 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              <p className="text-sm">Fetching URL and generating posts…</p>
            </div>
          )}

          {!loading && posts.length > 0 && (
            <div className="space-y-3">
              {posts.map((post, idx) => {
                const limit = getCharLimit(post.platform);
                const charColor = getCharColor(post.content, post.platform);
                return (
                  <div key={idx} className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{post.platform}</span>
                      <span className={`text-xs ${charColor}`}>
                        {post.content.length}/{limit}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{post.content}</p>
                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void copyPost(post.content, idx)}
                      >
                        {copiedIdx === idx ? (
                          <Check className="h-3 w-3 mr-1" />
                        ) : (
                          <Copy className="h-3 w-3 mr-1" />
                        )}
                        Copy
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => { onApply(post.content); onClose(); }}
                      >
                        Use in Composer
                      </Button>
                    </div>
                  </div>
                );
              })}
              <Button variant="outline" size="sm" onClick={() => void generate()} disabled={loading}>
                <RefreshCw className="h-3 w-3 mr-1" />
                Regenerate
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
