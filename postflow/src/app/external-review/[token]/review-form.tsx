"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { CheckCircle2, XCircle } from "lucide-react";

interface ReviewFormProps {
  token: string;
  post: {
    id: string;
    content: string;
    mediaType: string;
    mediaUrls: string[];
    status: string;
  };
  review: {
    id: string;
    reviewerEmail: string;
    reviewerName: string | null;
    message: string | null;
    status: string;
    expiresAt: string | null;
    createdAt: string;
  };
}

export function ReviewForm({ token, post, review }: ReviewFormProps) {
  const [reviewerName, setReviewerName] = useState(review.reviewerName ?? "");
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [decision, setDecision] = useState<"APPROVED" | "REJECTED" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(chosenDecision: "APPROVED" | "REJECTED") {
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/external-review/${token}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: chosenDecision, feedback: feedback || undefined }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to submit review");
      }

      setDecision(chosenDecision);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit review");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        {decision === "APPROVED" ? (
          <>
            <CheckCircle2 className="h-16 w-16 text-green-500" />
            <h2 className="text-2xl font-bold text-green-700">Post Approved!</h2>
            <p className="text-muted-foreground">
              Your approval has been submitted. The post owner has been notified.
            </p>
          </>
        ) : (
          <>
            <XCircle className="h-16 w-16 text-red-500" />
            <h2 className="text-2xl font-bold text-red-700">Changes Requested</h2>
            <p className="text-muted-foreground">
              Your feedback has been submitted. The post owner has been notified.
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Post content preview */}
      <div className="rounded-lg border bg-card p-4">
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Post Content
        </h3>
        <p className="whitespace-pre-wrap text-sm">{post.content}</p>
        {post.mediaType === "IMAGE" && post.mediaUrls.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {post.mediaUrls.map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`Media ${i + 1}`}
                className="h-24 w-24 rounded-md object-cover border"
              />
            ))}
          </div>
        )}
      </div>

      {/* Reviewer info */}
      <div>
        <label className="mb-1 block text-sm font-medium">Your name (optional)</label>
        <Input
          value={reviewerName}
          onChange={(e) => setReviewerName(e.target.value)}
          placeholder="Reviewer name"
          disabled={isSubmitting}
        />
      </div>

      {/* Feedback */}
      <div>
        <label className="mb-1 block text-sm font-medium">Feedback (optional)</label>
        <Textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Add any comments or feedback..."
          rows={4}
          disabled={isSubmitting}
        />
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        <Button
          onClick={() => handleSubmit("APPROVED")}
          disabled={isSubmitting}
          className="flex-1 bg-green-600 hover:bg-green-700"
        >
          <CheckCircle2 className="mr-2 h-4 w-4" />
          Approve
        </Button>
        <Button
          variant="destructive"
          onClick={() => handleSubmit("REJECTED")}
          disabled={isSubmitting}
          className="flex-1"
        >
          <XCircle className="mr-2 h-4 w-4" />
          Request Changes
        </Button>
      </div>
    </div>
  );
}
