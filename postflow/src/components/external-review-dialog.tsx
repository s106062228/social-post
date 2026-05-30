"use client";

import { useState, useTransition, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { X, Send, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";

interface ExternalReview {
  id: string;
  reviewerEmail: string;
  reviewerName: string | null;
  message: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  feedback: string | null;
  respondedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface ExternalReviewDialogProps {
  postId: string;
  postContent: string;
  onClose: () => void;
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  PENDING: <Clock className="h-3 w-3" />,
  APPROVED: <CheckCircle2 className="h-3 w-3" />,
  REJECTED: <XCircle className="h-3 w-3" />,
  CANCELLED: <X className="h-3 w-3" />,
};

export function ExternalReviewDialog({
  postId,
  postContent,
  onClose,
}: ExternalReviewDialogProps) {
  const [activeTab, setActiveTab] = useState<"send" | "existing">("send");
  const [reviews, setReviews] = useState<ExternalReview[]>([]);
  const [isLoadingReviews, setIsLoadingReviews] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Send form state
  const [reviewerEmail, setReviewerEmail] = useState("");
  const [reviewerName, setReviewerName] = useState("");
  const [message, setMessage] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  useEffect(() => {
    if (activeTab === "existing") {
      void loadReviews();
    }
  }, [activeTab]);

  async function loadReviews() {
    setIsLoadingReviews(true);
    try {
      const res = await fetch(`/api/posts/${postId}/external-reviews`);
      if (res.ok) {
        const data = (await res.json()) as { reviews: ExternalReview[] };
        setReviews(data.reviews);
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingReviews(false);
    }
  }

  function handleSend() {
    if (!reviewerEmail) return;
    startTransition(async () => {
      try {
        const body: Record<string, string> = { reviewerEmail };
        if (reviewerName) body.reviewerName = reviewerName;
        if (message) body.message = message;
        if (expiresAt) body.expiresAt = new Date(expiresAt).toISOString();

        const res = await fetch(`/api/posts/${postId}/external-reviews`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Failed to send review request");
        }

        toast({
          title: "Review request sent",
          description: `Invite sent to ${reviewerEmail}`,
          variant: "success",
        });
        setReviewerEmail("");
        setReviewerName("");
        setMessage("");
        setExpiresAt("");
        setActiveTab("existing");
        await loadReviews();
      } catch (err) {
        toast({
          title: "Failed to send review request",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
      }
    });
  }

  async function handleCancel(reviewId: string) {
    try {
      const res = await fetch(
        `/api/posts/${postId}/external-reviews/${reviewId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to cancel review");
      }
      toast({ title: "Review request cancelled", variant: "success" });
      await loadReviews();
    } catch (err) {
      toast({
        title: "Failed to cancel review",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    }
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>External Review Requests</DialogTitle>
        </DialogHeader>

        {/* Tab bar */}
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          <button
            onClick={() => setActiveTab("send")}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === "send"
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Send Request
          </button>
          <button
            onClick={() => setActiveTab("existing")}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === "existing"
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Existing Requests
          </button>
        </div>

        {activeTab === "send" && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">
                Reviewer email <span className="text-red-500">*</span>
              </label>
              <Input
                type="email"
                value={reviewerEmail}
                onChange={(e) => setReviewerEmail(e.target.value)}
                placeholder="reviewer@example.com"
                disabled={isPending}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Reviewer name (optional)
              </label>
              <Input
                value={reviewerName}
                onChange={(e) => setReviewerName(e.target.value)}
                placeholder="Reviewer name"
                disabled={isPending}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Message (optional)
              </label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Add a note to the reviewer..."
                rows={3}
                disabled={isPending}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Expires at (optional)
              </label>
              <Input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                disabled={isPending}
              />
            </div>
            <Button
              onClick={handleSend}
              disabled={!reviewerEmail || isPending}
              className="w-full"
            >
              {isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Send Review Request
            </Button>
          </div>
        )}

        {activeTab === "existing" && (
          <div className="space-y-3">
            {isLoadingReviews ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : reviews.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No review requests sent yet.
              </p>
            ) : (
              reviews.map((r) => (
                <div key={r.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {r.reviewerEmail}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status] ?? ""}`}
                        >
                          {STATUS_ICONS[r.status]}
                          {r.status.toLowerCase()}
                        </span>
                      </div>
                      {r.reviewerName && (
                        <p className="text-xs text-muted-foreground">{r.reviewerName}</p>
                      )}
                      {r.feedback && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground italic">
                          "{r.feedback}"
                        </p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        Sent {new Date(r.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    {r.status === "PENDING" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancel(r.id)}
                        title="Cancel review request"
                      >
                        <X className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
