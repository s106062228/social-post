"use client";

import { useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Star, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "@/hooks/use-toast";

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

interface QualityDashboardProps {
  postId: string;
}

function scoreBadgeClass(score: number): string {
  if (score >= 80) return "bg-green-100 text-green-800 border-green-200";
  if (score >= 60) return "bg-yellow-100 text-yellow-800 border-yellow-200";
  if (score >= 40) return "bg-orange-100 text-orange-800 border-orange-200";
  return "bg-red-100 text-red-800 border-red-200";
}

function progressColor(score: number): string {
  if (score >= 80) return "[&>div]:bg-green-500";
  if (score >= 60) return "[&>div]:bg-yellow-500";
  if (score >= 40) return "[&>div]:bg-orange-500";
  return "[&>div]:bg-red-500";
}

interface SignalRowProps {
  label: string;
  score: number;
  description: string;
}

function SignalRow({ label, score, description }: SignalRowProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{Math.round(score)}/100</span>
      </div>
      <Progress
        value={score}
        className={`h-2 ${progressColor(score)}`}
      />
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

export function QualityDashboard({ postId }: QualityDashboardProps) {
  const [data, setData] = useState<QualityData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const fetchQuality = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/posts/${postId}/quality`);
      if (!res.ok) throw new Error("Failed to load quality data");
      const json = (await res.json()) as QualityData;
      setData(json);
    } catch (err) {
      toast({
        title: "Failed to load quality score",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [postId]);

  function handleToggle() {
    if (!expanded && !data) {
      void fetchQuality();
    }
    setExpanded((v: boolean) => !v);
  }

  const readabilityDesc =
    data
      ? data.breakdown.readability >= 70
        ? "Easy to read — great for social media"
        : data.breakdown.readability >= 50
        ? "Moderately readable"
        : "Complex text — consider simplifying"
      : "";

  const seoDesc =
    data
      ? `${data.breakdown.seo >= 84 ? "Excellent" : data.breakdown.seo >= 67 ? "Good" : data.breakdown.seo >= 50 ? "Fair" : "Needs improvement"} SEO optimisation`
      : "";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Star className="h-4 w-4" />
            Content Quality Score
          </CardTitle>
          <div className="flex items-center gap-2">
            {data && (
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchQuality}
                disabled={loading}
                className="h-7 px-2"
              >
                {loading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggle}
              className="h-7 px-2"
            >
              {expanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {expanded && data && (
          <div className="flex items-center gap-3 pt-2">
            <Badge
              variant="outline"
              className={`text-lg font-bold px-3 py-1 ${scoreBadgeClass(data.qualityScore)}`}
            >
              {data.qualityScore}
            </Badge>
            <div>
              <p className="font-semibold text-sm">{data.label}</p>
              <p className="text-xs text-muted-foreground">Overall quality score</p>
            </div>
          </div>
        )}

        {expanded && !data && !loading && (
          <p className="text-sm text-muted-foreground pt-1">Loading quality signals…</p>
        )}

        {loading && (
          <div className="flex items-center gap-2 pt-1">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Analysing content…</span>
          </div>
        )}
      </CardHeader>

      {expanded && data && (
        <CardContent className="pt-0 space-y-4">
          <SignalRow
            label="Readability"
            score={data.breakdown.readability}
            description={readabilityDesc}
          />
          <SignalRow
            label="SEO Optimisation"
            score={data.breakdown.seo}
            description={seoDesc}
          />
          {data.breakdown.sentiment !== null && (
            <SignalRow
              label="Sentiment"
              score={data.breakdown.sentiment}
              description={
                data.breakdown.sentiment >= 80
                  ? "Positive tone — likely to drive engagement"
                  : data.breakdown.sentiment >= 55
                  ? "Neutral tone"
                  : "Negative tone detected"
              }
            />
          )}
          {data.breakdown.compliance !== null && (
            <SignalRow
              label="Brand Compliance"
              score={data.breakdown.compliance}
              description={
                data.breakdown.compliance === 100
                  ? "Fully compliant with brand guidelines"
                  : "Some brand guideline issues detected"
              }
            />
          )}
        </CardContent>
      )}
    </Card>
  );
}
