"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Loader2, Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface SubmissionFormProps {
  slug: string;
  thankYouMessage: string | null;
}

export function SubmissionForm({ slug, thankYouMessage }: SubmissionFormProps) {
  const [authorName, setAuthorName] = useState("");
  const [authorTitle, setAuthorTitle] = useState("");
  const [company, setCompany] = useState("");
  const [content, setContent] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!authorName.trim() || !content.trim()) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/t/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorName: authorName.trim(),
          authorTitle: authorTitle.trim() || null,
          company: company.trim() || null,
          content: content.trim(),
          rating,
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to submit. Please try again.");
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border bg-card py-12 text-center">
        <CheckCircle2 className="h-16 w-16 text-green-500" />
        <h2 className="text-2xl font-bold">Thank you!</h2>
        <p className="max-w-sm text-muted-foreground whitespace-pre-wrap">
          {thankYouMessage ?? "Your submission has been received and will be reviewed shortly."}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border bg-card p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">Your name *</label>
          <Input
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            placeholder="Jane Doe"
            disabled={isSubmitting}
            maxLength={200}
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Title (optional)</label>
          <Input
            value={authorTitle}
            onChange={(e) => setAuthorTitle(e.target.value)}
            placeholder="Marketing Director"
            disabled={isSubmitting}
            maxLength={200}
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Company (optional)</label>
        <Input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Acme Inc."
          disabled={isSubmitting}
          maxLength={200}
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Your feedback *</label>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Tell us about your experience..."
          rows={5}
          disabled={isSubmitting}
          maxLength={5000}
          required
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Rating (optional)</label>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              disabled={isSubmitting}
              onClick={() => setRating((prev) => (prev === n ? null : n))}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              className="p-0.5"
            >
              <Star
                className={cn(
                  "h-6 w-6 transition-colors",
                  rating !== null && n <= rating
                    ? "fill-yellow-400 text-yellow-400"
                    : "text-muted-foreground/30"
                )}
              />
            </button>
          ))}
          {rating !== null && (
            <button
              type="button"
              onClick={() => setRating(null)}
              disabled={isSubmitting}
              className="ml-2 text-xs text-muted-foreground hover:underline"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <Button type="submit" disabled={!authorName.trim() || !content.trim() || isSubmitting} className="w-full">
        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Submit
      </Button>
    </form>
  );
}
