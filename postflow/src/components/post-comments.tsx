"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, CheckCircle2, Circle, Trash2, Loader2, Send } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface PostComment {
  id: string;
  userId: string;
  authorName: string;
  comment: string;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CommentsResponse {
  comments: PostComment[];
  currentUserId: string;
}

interface PostCommentsProps {
  postId: string;
}

export function PostComments({ postId }: PostCommentsProps) {
  const [comments, setComments] = useState<PostComment[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [newComment, setNewComment] = useState("");

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/posts/${postId}/comments`);
      if (!res.ok) throw new Error("Failed to load comments");
      const data = (await res.json()) as CommentsResponse;
      setComments(data.comments);
      setCurrentUserId(data.currentUserId);
    } catch {
      toast({ title: "Error", description: "Could not load comments", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    void fetchComments();
  }, [fetchComments]);

  const handleSubmit = async () => {
    if (!newComment.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: newComment.trim() }),
      });
      if (!res.ok) throw new Error("Failed to add comment");
      const data = (await res.json()) as { comment: PostComment };
      setComments((prev) => [...prev, data.comment]);
      setNewComment("");
      toast({ title: "Note added" });
    } catch {
      toast({ title: "Error", description: "Could not add note", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolve = async (commentId: string) => {
    try {
      const res = await fetch(`/api/posts/${postId}/comments/${commentId}/resolve`, {
        method: "PATCH",
      });
      if (!res.ok) throw new Error("Failed to update note");
      const data = (await res.json()) as { comment: PostComment };
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? data.comment : c))
      );
    } catch {
      toast({ title: "Error", description: "Could not update note", variant: "destructive" });
    }
  };

  const handleDelete = async (commentId: string) => {
    try {
      const res = await fetch(`/api/posts/${postId}/comments/${commentId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to delete note");
      }
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      toast({ title: "Note deleted" });
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Could not delete note",
        variant: "destructive",
      });
    }
  };

  const openCount = comments.filter((c) => !c.resolved).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-4 w-4" />
          Notes
          {openCount > 0 && (
            <Badge variant="secondary" className="ml-1">
              {openCount} open
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : comments.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No notes yet. Add one below.
          </p>
        ) : (
          <ul className="space-y-3">
            {comments.map((c) => (
              <li
                key={c.id}
                className={`rounded-lg border p-3 text-sm ${
                  c.resolved ? "bg-muted/40 opacity-70" : "bg-background"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium truncate">{c.authorName}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {new Date(c.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {c.resolved && (
                        <Badge variant="outline" className="text-xs py-0">
                          Resolved
                        </Badge>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap break-words">{c.comment}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title={c.resolved ? "Reopen" : "Resolve"}
                      onClick={() => void handleResolve(c.id)}
                    >
                      {c.resolved ? (
                        <Circle className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      )}
                    </Button>
                    {c.userId === currentUserId && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        title="Delete note"
                        onClick={() => void handleDelete(c.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-2 pt-1">
          <Textarea
            placeholder="Add a note… (Ctrl+Enter to submit)"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            className="min-h-[70px] resize-none text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                void handleSubmit();
              }
            }}
          />
          <Button
            size="icon"
            className="shrink-0 self-end"
            disabled={!newComment.trim() || submitting}
            onClick={() => void handleSubmit()}
            title="Add note"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
