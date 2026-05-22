"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Loader2, Star } from "lucide-react";

interface QualityData {
  qualityScore: number;
  label: string;
  breakdown: {
    readability: number;
    seo: number;
    sentiment: number | null;
    compliance: number | null;
  };
}

interface QualityScoreBadgeProps {
  postId: string;
}

function scoreVariant(score: number): "default" | "secondary" | "destructive" | "outline" {
  if (score >= 80) return "default";
  if (score >= 60) return "secondary";
  if (score >= 40) return "outline";
  return "destructive";
}

function scoreColorClass(score: number): string {
  if (score >= 80) return "bg-green-100 text-green-800 border-green-200";
  if (score >= 60) return "bg-yellow-100 text-yellow-800 border-yellow-200";
  if (score >= 40) return "bg-orange-100 text-orange-800 border-orange-200";
  return "bg-red-100 text-red-800 border-red-200";
}

export function QualityScoreBadge({ postId }: QualityScoreBadgeProps) {
  const [data, setData] = useState<QualityData | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  async function fetchQuality() {
    if (fetched || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/posts/${postId}/quality`);
      if (res.ok) {
        const json = (await res.json()) as QualityData;
        setData(json);
      }
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
      setFetched(true);
    }
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="cursor-default"
            onMouseEnter={fetchQuality}
          >
            {loading ? (
              <Badge variant="outline" className="gap-1 text-xs px-1.5 py-0">
                <Loader2 className="h-3 w-3 animate-spin" />
              </Badge>
            ) : data ? (
              <Badge
                variant="outline"
                className={`gap-1 text-xs px-1.5 py-0 font-medium ${scoreColorClass(data.qualityScore)}`}
              >
                <Star className="h-2.5 w-2.5" />
                {data.qualityScore}
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 text-xs px-1.5 py-0 text-muted-foreground">
                <Star className="h-2.5 w-2.5" />
                Q
              </Badge>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {data ? (
            <div className="space-y-1">
              <p className="font-medium">Quality: {data.label} ({data.qualityScore}/100)</p>
              <p>Readability: {Math.round(data.breakdown.readability)}</p>
              <p>SEO: {data.breakdown.seo}</p>
              {data.breakdown.sentiment !== null && (
                <p>Sentiment: {data.breakdown.sentiment}</p>
              )}
              {data.breakdown.compliance !== null && (
                <p>Brand: {data.breakdown.compliance}</p>
              )}
            </div>
          ) : loading ? (
            <p>Loading quality score…</p>
          ) : (
            <p>Hover to load quality score</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
