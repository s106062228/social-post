"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FileText, History, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { DeletePostButton } from "./delete-post-button";
import { RetryPostButton } from "./retry-post-button";
import { DuplicatePostButton } from "./duplicate-post-button";
import { SaveAsTemplateButton } from "./save-as-template-button";
import { BulkRescheduleButton } from "./bulk-reschedule-button";
import { RequestApprovalButton } from "./request-approval-button";
import { SharePostButton } from "./share-post-button";

type PublishResult = {
  platform: string;
  status: string;
  publishedUrl: string | null;
};

type PostTagItem = {
  tag: { id: string; name: string; color: string };
};

export type PostListItem = {
  id: string;
  content: string;
  status: string;
  mediaType: string;
  mediaUrls: string[];
  scheduledAt: Date | string | null;
  approvalStatus: string;
  approverNote: string | null;
  publishResults: PublishResult[];
  tags: PostTagItem[];
};

function ApprovalBadge({ approvalStatus }: { approvalStatus: string }) {
  if (approvalStatus === "NONE") return null;
  const styles: Record<string, string> = {
    PENDING: "bg-yellow-100 text-yellow-700",
    APPROVED: "bg-emerald-100 text-emerald-700",
    REJECTED: "bg-red-100 text-red-700",
  };
  const labels: Record<string, string> = {
    PENDING: "pending review",
    APPROVED: "approved",
    REJECTED: "rejected",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[approvalStatus] ?? "bg-gray-100 text-gray-700"}`}
    >
      {labels[approvalStatus] ?? approvalStatus.toLowerCase()}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-700",
    SCHEDULED: "bg-blue-100 text-blue-700",
    PUBLISHING: "bg-yellow-100 text-yellow-700",
    PUBLISHED: "bg-green-100 text-green-700",
    PARTIALLY_PUBLISHED: "bg-orange-100 text-orange-700",
    FAILED: "bg-red-100 text-red-700",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? "bg-gray-100 text-gray-700"}`}
    >
      {status.replace(/_/g, " ").toLowerCase()}
    </span>
  );
}

interface PostsListClientProps {
  posts: PostListItem[];
}

export function PostsListClient({ posts }: PostsListClientProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const selectablePosts = posts.filter((p) => p.status !== "PUBLISHING");
  const allSelected =
    selectablePosts.length > 0 && selected.size === selectablePosts.length;
  const someSelected = selected.size > 0 && !allSelected;

  function toggleAll() {
    if (allSelected || someSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectablePosts.map((p) => p.id)));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleBulkDelete() {
    if (selected.size === 0) return;
    const count = selected.size;
    if (!confirm(`Delete ${count} post${count !== 1 ? "s" : ""}? This cannot be undone.`)) return;

    startTransition(async () => {
      try {
        const res = await fetch("/api/posts/bulk", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: Array.from(selected) }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Bulk delete failed");
        }
        const data = (await res.json()) as { deleted: number };
        toast({
          title: `Deleted ${data.deleted} post${data.deleted !== 1 ? "s" : ""}`,
          variant: "success",
        });
        setSelected(new Set());
        router.refresh();
      } catch (err) {
        toast({
          title: "Bulk delete failed",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
      }
    });
  }

  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <FileText className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No posts found</p>
        <Button size="sm" asChild>
          <Link href="/posts/new">Create a post</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      {/* Bulk action bar */}
      <div className="mb-3 flex items-center gap-3 border-b pb-3">
        <input
          type="checkbox"
          id="select-all"
          checked={allSelected}
          ref={(el: HTMLInputElement | null) => {
            if (el) el.indeterminate = someSelected;
          }}
          onChange={toggleAll}
          className="h-4 w-4 cursor-pointer rounded border-gray-300 accent-primary"
          aria-label="Select all posts"
        />
        <label
          htmlFor="select-all"
          className="cursor-pointer select-none text-sm text-muted-foreground"
        >
          {selected.size > 0
            ? `${selected.size} selected`
            : "Select all"}
        </label>
        {selected.size > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <BulkRescheduleButton
              selectedIds={Array.from(selected).filter(
                (id) => posts.find((p) => p.id === id)?.status === "SCHEDULED"
              )}
              onDone={() => setSelected(new Set())}
            />
            <Button
              variant="destructive"
              size="sm"
              onClick={handleBulkDelete}
              disabled={isPending}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete {selected.size} post{selected.size !== 1 ? "s" : ""}
            </Button>
          </div>
        )}
      </div>

      {/* Post rows */}
      <div className="divide-y">
        {posts.map((post) => {
          const canSelect = post.status !== "PUBLISHING";
          const isSelected = selected.has(post.id);

          return (
            <div
              key={post.id}
              className={`flex items-start gap-4 py-4 first:pt-0 last:pb-0 transition-colors ${
                isSelected ? "rounded bg-accent/30 px-1 -mx-1" : ""
              }`}
            >
              <div className="flex items-center pt-0.5">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => canSelect && toggleOne(post.id)}
                  disabled={!canSelect}
                  className="h-4 w-4 cursor-pointer rounded border-gray-300 accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Select post"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm">{post.content}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <StatusBadge status={post.status} />
                  <ApprovalBadge approvalStatus={post.approvalStatus} />
                  {post.scheduledAt && (
                    <span className="text-xs text-muted-foreground">
                      {post.status === "SCHEDULED"
                        ? `Scheduled: ${new Date(post.scheduledAt).toLocaleString()}`
                        : new Date(post.scheduledAt).toLocaleString()}
                    </span>
                  )}
                  {post.publishResults.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {post.publishResults.map((r) => r.platform).join(", ")}
                    </span>
                  )}
                  {post.tags.map(({ tag }) => (
                    <span
                      key={tag.id}
                      className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                      style={{ backgroundColor: tag.color }}
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {(post.status === "DRAFT" || post.status === "SCHEDULED") && (
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/posts/${post.id}/edit`}>Edit</Link>
                  </Button>
                )}
                {post.status === "DRAFT" &&
                  post.approvalStatus !== "PENDING" &&
                  post.approvalStatus !== "APPROVED" && (
                    <RequestApprovalButton postId={post.id} />
                  )}
                {(post.status === "FAILED" ||
                  post.status === "PARTIALLY_PUBLISHED") && (
                  <RetryPostButton postId={post.id} />
                )}
                <DuplicatePostButton postId={post.id} />
                <Button variant="ghost" size="sm" asChild title="Version history">
                  <Link href={`/posts/${post.id}/versions`}>
                    <History className="h-4 w-4" />
                  </Link>
                </Button>
                <SaveAsTemplateButton
                  postContent={post.content}
                  postMediaType={post.mediaType}
                  postMediaUrls={post.mediaUrls}
                />
                <SharePostButton postId={post.id} />
                <DeletePostButton postId={post.id} status={post.status} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
