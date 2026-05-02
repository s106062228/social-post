"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Smile } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface AnalyzeSentimentButtonProps {
  postId: string;
}

export function AnalyzeSentimentButton({ postId }: AnalyzeSentimentButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);

  function handleAnalyze() {
    if (loading || isPending) return;
    setLoading(true);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/posts/${postId}/analyze-sentiment`, { method: "POST" });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Sentiment analysis failed");
        }
        const data = (await res.json()) as { sentiment?: string; sentimentScore?: number };
        toast({
          title: `Sentiment: ${data.sentiment ?? "unknown"}`,
          description: data.sentimentScore !== undefined
            ? `Confidence: ${Math.round(data.sentimentScore * 100)}%`
            : undefined,
          variant: "success",
        });
        router.refresh();
      } catch (err) {
        toast({
          title: "Sentiment analysis failed",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleAnalyze}
      disabled={loading || isPending}
      title="Analyze sentiment"
    >
      <Smile className="h-4 w-4" />
    </Button>
  );
}
