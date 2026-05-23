"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

interface FailedPost {
  id: string;
  content: string;
  updatedAt: string | Date;
  failedPlatforms: string[];
}

interface FailedPostsAlertProps {
  posts: FailedPost[];
  onRetrySuccess?: () => void;
}

export function FailedPostsAlert({ posts, onRetrySuccess }: FailedPostsAlertProps) {
  const [retrying, setRetrying] = useState<Record<string, boolean>>({});
  const [retried, setRetried] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  if (posts.length === 0) return null;

  async function handleRetry(postId: string) {
    setRetrying((prev: Record<string, boolean>) => ({ ...prev, [postId]: true }));
    try {
      const res = await fetch(`/api/posts/${postId}/retry`, { method: "POST" });
      if (!res.ok) throw new Error("Retry failed");
      setRetried((prev: Set<string>) => new Set([...prev, postId]));
      toast({ title: "Retry queued", description: "Post has been re-queued for publishing." });
      onRetrySuccess?.();
    } catch {
      toast({ title: "Error", description: "Failed to retry post.", variant: "destructive" });
    } finally {
      setRetrying((prev: Record<string, boolean>) => ({ ...prev, [postId]: false }));
    }
  }

  const visiblePosts = posts.filter((p) => !retried.has(p.id));
  if (visiblePosts.length === 0) return null;

  return (
    <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4" />
          Failed Posts
        </CardTitle>
        <CardDescription className="text-amber-700 dark:text-amber-400">
          {visiblePosts.length} post{visiblePosts.length !== 1 ? "s" : ""} failed to publish
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-amber-200 dark:divide-amber-800">
          {visiblePosts.map((post) => (
            <div key={post.id} className="flex items-center gap-3 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm text-amber-900 dark:text-amber-200">
                  {post.content.slice(0, 60)}{post.content.length > 60 ? "…" : ""}
                </p>
                <div className="mt-0.5 flex items-center gap-1.5">
                  {post.failedPlatforms.slice(0, 3).map((p) => (
                    <span
                      key={p}
                      className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700"
                    >
                      {p.charAt(0) + p.slice(1).toLowerCase()}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-7 border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300",
                    retrying[post.id] && "opacity-60"
                  )}
                  disabled={retrying[post.id]}
                  onClick={() => handleRetry(post.id)}
                >
                  <RefreshCw className={cn("h-3 w-3 mr-1", retrying[post.id] && "animate-spin")} />
                  Retry
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-amber-700" asChild>
                  <Link href={`/posts/${post.id}/edit`}>Edit</Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
        {posts.length > visiblePosts.length && (
          <p className="mt-2 text-xs text-amber-700">
            {posts.length - visiblePosts.length} post{posts.length - visiblePosts.length !== 1 ? "s" : ""} retried
          </p>
        )}
      </CardContent>
    </Card>
  );
}
