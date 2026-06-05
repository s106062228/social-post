"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { Platform } from "@prisma/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import {
  MessageSquare,
  RefreshCw,
  CheckCheck,
  Reply,
  Eye,
  EyeOff,
  ChevronDown,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface SocialComment {
  id: string;
  platformPostId: string;
  platformCommentId: string;
  authorName: string;
  authorHandle: string;
  authorAvatarUrl: string | null;
  content: string;
  isRead: boolean;
  isReplied: boolean;
  platform: Platform;
  postedAt: Date | string;
  fetchedAt: Date | string;
}

interface ResponseTemplate {
  id: string;
  name: string;
  content: string;
  category: string | null;
  usageCount: number;
}

interface Props {
  initialComments: SocialComment[];
  totalUnread: number;
  lastSynced: Date | null;
}

const PLATFORM_LABELS: Partial<Record<Platform, string>> = {
  [Platform.FACEBOOK]: "Facebook",
  [Platform.INSTAGRAM]: "Instagram",
};

const PLATFORM_COLORS: Partial<Record<Platform, string>> = {
  [Platform.FACEBOOK]: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  [Platform.INSTAGRAM]: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
};

export function InboxClient({ initialComments, totalUnread: initialUnread, lastSynced }: Props) {
  const { toast } = useToast();
  const [comments, setComments] = useState<SocialComment[]>(initialComments);
  const [unreadCount, setUnreadCount] = useState(initialUnread);
  const [platformFilter, setPlatformFilter] = useState<Platform | "all">("all");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [syncing, startSync] = useTransition();
  const [sending, startSend] = useTransition();
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(
    lastSynced ? new Date(lastSynced) : null
  );
  const [templates, setTemplates] = useState<ResponseTemplate[]>([]);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/response-templates");
      const data = (await res.json()) as { templates?: ResponseTemplate[] };
      setTemplates(data.templates ?? []);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  async function insertTemplate(template: ResponseTemplate) {
    setReplyText(template.content);
    setShowTemplateMenu(false);
    // Increment usage count fire-and-forget
    void fetch(`/api/response-templates/${template.id}/use`, { method: "POST" });
  }

  async function handleSync() {
    startSync(async () => {
      try {
        const res = await fetch("/api/inbox/sync", { method: "POST", body: "{}" });
        const data = await res.json() as { synced: number; platforms: string[] };
        if (!res.ok) {
          toast({ title: "Sync failed", variant: "destructive" });
          return;
        }
        toast({
          title: `Synced ${data.synced} comment${data.synced !== 1 ? "s" : ""}`,
          description: data.platforms.length
            ? `From: ${data.platforms.join(", ")}`
            : "No new comments found",
        });
        setLastSyncTime(new Date());
        const listRes = await fetch("/api/inbox/comments?limit=50");
        const listData = await listRes.json() as { comments: SocialComment[]; totalUnread: number };
        setComments(listData.comments);
        setUnreadCount(listData.totalUnread);
      } catch {
        toast({ title: "Sync failed", variant: "destructive" });
      }
    });
  }

  async function handleToggleRead(comment: SocialComment) {
    try {
      const res = await fetch(`/api/inbox/comments/${comment.id}/read`, {
        method: "PATCH",
      });
      const data = await res.json() as { isRead: boolean };
      if (!res.ok) return;
      setComments((prev) =>
        prev.map((c) =>
          c.id === comment.id ? { ...c, isRead: data.isRead } : c
        )
      );
      setUnreadCount((prev) => prev + (data.isRead ? -1 : 1));
    } catch {
      // silent
    }
  }

  async function handleMarkAllRead() {
    const unreadIds = comments.filter((c) => !c.isRead).map((c) => c.id);
    if (unreadIds.length === 0) return;
    try {
      const res = await fetch("/api/inbox/comments/bulk-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentIds: unreadIds }),
      });
      const data = await res.json() as { updated: number };
      if (!res.ok) return;
      setComments((prev) => prev.map((c) => ({ ...c, isRead: true })));
      setUnreadCount(0);
      toast({ title: `Marked ${data.updated} comment${data.updated !== 1 ? "s" : ""} as read` });
    } catch {
      toast({ title: "Failed to mark as read", variant: "destructive" });
    }
  }

  function handleReply(commentId: string) {
    if (replyingTo === commentId) {
      setReplyingTo(null);
      setReplyText("");
      setShowTemplateMenu(false);
    } else {
      setReplyingTo(commentId);
      setReplyText("");
      setShowTemplateMenu(false);
    }
  }

  async function handleSendReply(comment: SocialComment) {
    if (!replyText.trim()) return;
    startSend(async () => {
      try {
        const res = await fetch(`/api/inbox/comments/${comment.id}/reply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reply: replyText }),
        });
        const data = await res.json() as { success?: boolean; error?: string };
        if (!res.ok) {
          toast({ title: data.error ?? "Reply failed", variant: "destructive" });
          return;
        }
        setComments((prev) =>
          prev.map((c) =>
            c.id === comment.id ? { ...c, isReplied: true, isRead: true } : c
          )
        );
        setUnreadCount((prev) => (comment.isRead ? prev : Math.max(0, prev - 1)));
        setReplyingTo(null);
        setReplyText("");
        setShowTemplateMenu(false);
        toast({ title: "Reply sent!" });
      } catch {
        toast({ title: "Reply failed", variant: "destructive" });
      }
    });
  }

  const filteredComments = comments.filter((c) => {
    if (platformFilter !== "all" && c.platform !== platformFilter) return false;
    if (showUnreadOnly && c.isRead) return false;
    return true;
  });

  const supportedPlatforms: Platform[] = [Platform.FACEBOOK, Platform.INSTAGRAM];
  const platformCounts: Partial<Record<Platform | "all", number>> = {
    all: comments.filter((c) => !c.isRead).length,
  };
  for (const p of supportedPlatforms) {
    platformCounts[p] = comments.filter((c) => c.platform === p && !c.isRead).length;
  }

  return (
    <div className="flex flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Comment Inbox</h1>
          <p className="text-muted-foreground">
            Manage incoming comments from your connected social accounts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastSyncTime && (
            <span className="text-xs text-muted-foreground">
              Last synced {formatDistanceToNow(lastSyncTime, { addSuffix: true })}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={syncing}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", syncing && "animate-spin")} />
            {syncing ? "Syncing…" : "Sync Now"}
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={platformFilter === "all" ? "default" : "outline"}
            onClick={() => setPlatformFilter("all")}
          >
            All
            {(platformCounts.all ?? 0) > 0 && (
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-xs">
                {platformCounts.all}
              </Badge>
            )}
          </Button>
          {supportedPlatforms.map((p) => (
            <Button
              key={p}
              size="sm"
              variant={platformFilter === p ? "default" : "outline"}
              onClick={() => setPlatformFilter(p)}
            >
              {PLATFORM_LABELS[p] ?? p}
              {(platformCounts[p] ?? 0) > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 px-1 text-xs">
                  {platformCounts[p]}
                </Badge>
              )}
            </Button>
          ))}
        </div>

        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            variant={showUnreadOnly ? "default" : "outline"}
            onClick={() => setShowUnreadOnly((v) => !v)}
          >
            {showUnreadOnly ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
            {showUnreadOnly ? "Show All" : "Unread Only"}
          </Button>
          {unreadCount > 0 && (
            <Button size="sm" variant="outline" onClick={handleMarkAllRead}>
              <CheckCheck className="h-4 w-4 mr-1" />
              Mark All Read
            </Button>
          )}
        </div>
      </div>

      {/* Comment list */}
      {filteredComments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <MessageSquare className="h-12 w-12 text-muted-foreground opacity-40" />
            <div className="text-center">
              <p className="font-medium">No comments yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Click &quot;Sync Now&quot; to fetch comments from your published posts.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredComments.map((comment) => (
            <Card
              key={comment.id}
              className={cn(
                "transition-colors",
                !comment.isRead && "border-primary/30 bg-primary/5"
              )}
            >
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className="h-9 w-9 shrink-0 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                    {comment.authorAvatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={comment.authorAvatarUrl}
                        alt={comment.authorName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-sm font-semibold text-muted-foreground">
                        {comment.authorName.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{comment.authorName}</span>
                      <span className="text-xs text-muted-foreground">@{comment.authorHandle}</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs",
                          PLATFORM_COLORS[comment.platform]
                        )}
                      >
                        {PLATFORM_LABELS[comment.platform] ?? comment.platform}
                      </Badge>
                      {comment.isReplied && (
                        <Badge variant="outline" className="text-xs bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300">
                          Replied
                        </Badge>
                      )}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(comment.postedAt), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>

                    <p className="mt-1 text-sm">{comment.content}</p>

                    <div className="flex items-center gap-2 mt-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => handleReply(comment.id)}
                      >
                        <Reply className="h-3 w-3 mr-1" />
                        Reply
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => handleToggleRead(comment)}
                      >
                        {comment.isRead ? (
                          <>
                            <EyeOff className="h-3 w-3 mr-1" />
                            Mark Unread
                          </>
                        ) : (
                          <>
                            <Eye className="h-3 w-3 mr-1" />
                            Mark Read
                          </>
                        )}
                      </Button>
                    </div>

                    {/* Inline reply form */}
                    {replyingTo === comment.id && (
                      <div className="mt-3 flex flex-col gap-2">
                        <Textarea
                          placeholder="Write a reply…"
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          className="min-h-[80px] text-sm"
                          maxLength={2200}
                        />
                        <div className="flex gap-2 flex-wrap items-center">
                          <Button
                            size="sm"
                            onClick={() => handleSendReply(comment)}
                            disabled={!replyText.trim() || sending}
                          >
                            {sending ? "Sending…" : "Send Reply"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setReplyingTo(null);
                              setShowTemplateMenu(false);
                            }}
                          >
                            Cancel
                          </Button>
                          {templates.length > 0 && (
                            <div className="relative ml-auto">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setShowTemplateMenu((v) => !v)}
                                className="text-xs"
                              >
                                Insert Template
                                <ChevronDown className="ml-1 h-3 w-3" />
                              </Button>
                              {showTemplateMenu && (
                                <div className="absolute right-0 top-8 z-10 w-64 rounded-md border bg-popover shadow-md">
                                  <div className="p-1">
                                    {templates.map((t) => (
                                      <button
                                        key={t.id}
                                        className="flex w-full flex-col items-start gap-0.5 rounded px-3 py-2 text-left text-sm hover:bg-accent"
                                        onClick={() => void insertTemplate(t)}
                                      >
                                        <span className="font-medium">{t.name}</span>
                                        {t.category && (
                                          <span className="text-xs text-muted-foreground">
                                            {t.category}
                                          </span>
                                        )}
                                        <span className="text-xs text-muted-foreground line-clamp-1">
                                          {t.content}
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
