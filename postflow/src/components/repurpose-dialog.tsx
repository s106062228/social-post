"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Wand2, Copy, Check, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const PLATFORM_LABELS: Record<string, string> = {
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  THREADS: "Threads",
};

const PLATFORM_LIMITS: Record<string, number> = {
  FACEBOOK: 63206,
  INSTAGRAM: 2200,
  THREADS: 500,
};

interface RepurposeVariant {
  platform: string;
  content: string;
}

interface RepurposeDialogProps {
  postId: string;
}

export function RepurposeDialog({ postId }: RepurposeDialogProps) {
  const [open, setOpen] = useState(false);
  const [variants, setVariants] = useState<RepurposeVariant[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleGenerate() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/posts/${postId}/repurpose`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Failed to repurpose content");
        }
        const data = (await res.json()) as { variants: RepurposeVariant[] };
        setVariants(data.variants);
      } catch (err) {
        toast({
          title: "Failed to generate repurposed content",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
      }
    });
  }

  async function handleCopy(content: string, platform: string) {
    await navigator.clipboard.writeText(content);
    setCopied(platform);
    setTimeout(() => setCopied(null), 1500);
  }

  function handleApplyVariant(variant: RepurposeVariant) {
    setApplying(variant.platform);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/posts/${postId}/variants`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            variants: [
              {
                platform: variant.platform,
                content: variant.content,
                mediaType: "NONE",
                mediaUrls: [],
              },
            ],
          }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Failed to apply variant");
        }
        toast({
          title: `${PLATFORM_LABELS[variant.platform] ?? variant.platform} variant applied`,
          variant: "success",
        });
      } catch (err) {
        toast({
          title: "Failed to apply variant",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
      } finally {
        setApplying(null);
      }
    });
  }

  function handleOpenChange(val: boolean) {
    setOpen(val);
    if (!val) {
      setVariants([]);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" title="Repurpose for other platforms">
          <Wand2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Repurpose Content</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Use AI to adapt your post for each platform&apos;s style and character limits.
          </p>

          {variants.length === 0 ? (
            <Button onClick={handleGenerate} disabled={isPending} className="w-full">
              {isPending ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Wand2 className="mr-2 h-4 w-4" />
                  Generate Repurposed Versions
                </>
              )}
            </Button>
          ) : (
            <div className="space-y-4">
              {variants.map((v) => {
                const limit = PLATFORM_LIMITS[v.platform] ?? 500;
                const over = v.content.length > limit;
                return (
                  <div key={v.platform} className="rounded-lg border p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">
                        {PLATFORM_LABELS[v.platform] ?? v.platform}
                      </span>
                      <span
                        className={`text-xs ${over ? "text-red-500" : "text-muted-foreground"}`}
                      >
                        {v.content.length}/{limit}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{v.content}</p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopy(v.content, v.platform)}
                      >
                        {copied === v.platform ? (
                          <Check className="mr-1 h-3 w-3 text-green-600" />
                        ) : (
                          <Copy className="mr-1 h-3 w-3" />
                        )}
                        Copy
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleApplyVariant(v)}
                        disabled={isPending || applying === v.platform}
                      >
                        {applying === v.platform ? "Applying…" : "Apply as Variant"}
                      </Button>
                    </div>
                  </div>
                );
              })}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleGenerate}
                disabled={isPending}
                className="w-full"
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
                Regenerate
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
