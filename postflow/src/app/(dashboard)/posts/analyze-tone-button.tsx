"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Mic } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface AnalyzeToneButtonProps {
  postId: string;
}

export function AnalyzeToneButton({ postId }: AnalyzeToneButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);

  function handleAnalyze() {
    if (loading || isPending) return;
    setLoading(true);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/posts/${postId}/analyze-tone`, { method: "POST" });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Tone analysis failed");
        }
        const data = (await res.json()) as { tone?: string; toneTraits?: string[] };
        toast({
          title: `Tone: ${data.tone ? capitalize(data.tone) : "unknown"}`,
          description:
            data.toneTraits && data.toneTraits.length > 0
              ? data.toneTraits.join(", ")
              : undefined,
          variant: "success",
        });
        router.refresh();
      } catch (err) {
        toast({
          title: "Tone analysis failed",
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
      title="Analyze tone"
    >
      <Mic className="h-4 w-4" />
    </Button>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
