"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, RefreshCw, AlertCircle, Plus } from "lucide-react";
import type { ContentGapSuggestion } from "@/lib/ai";

const PRIORITY_STYLES: Record<
  ContentGapSuggestion["priority"],
  { badge: string; border: string }
> = {
  high: {
    badge: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    border: "border-l-4 border-red-400",
  },
  medium: {
    badge: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    border: "border-l-4 border-yellow-400",
  },
  low: {
    badge: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    border: "border-l-4 border-blue-400",
  },
};

interface ContentGapResponse {
  suggestions: ContentGapSuggestion[];
  coveredTopicsCount: number;
}

export function ContentGapCard() {
  const [data, setData] = useState<ContentGapResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGaps = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/content-gaps", { method: "POST" });
      if (res.status === 503) {
        setError("AI features are not configured.");
        return;
      }
      if (!res.ok) throw new Error("Failed to fetch");
      const json = (await res.json()) as ContentGapResponse;
      setData(json);
    } catch {
      setError("Could not load content gap analysis. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle>Content Gap Analysis</CardTitle>
              <CardDescription className="mt-1">
                AI-suggested topics you haven&apos;t covered yet
              </CardDescription>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchGaps()}
            disabled={loading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {data ? "Refresh" : "Analyze Gaps"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4 text-red-500" />
            {error}
          </div>
        )}

        {!data && !error && !loading && (
          <p className="text-sm text-muted-foreground">
            Click &quot;Analyze Gaps&quot; to discover content topics you haven&apos;t
            explored yet, based on your publishing history.
          </p>
        )}

        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-md bg-muted animate-pulse" />
            ))}
          </div>
        )}

        {data && (
          <>
            {data.coveredTopicsCount > 0 && (
              <p className="mb-3 text-sm text-muted-foreground">
                Based on{" "}
                <span className="font-medium text-foreground">
                  {data.coveredTopicsCount} topics
                </span>{" "}
                from your recent posts
              </p>
            )}

            {data.suggestions.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No gap suggestions available. Publish more posts to enable gap analysis.
              </p>
            )}

            {data.suggestions.length > 0 && (
              <div className="space-y-3">
                {data.suggestions.map((suggestion, i) => {
                  const styles = PRIORITY_STYLES[suggestion.priority];
                  return (
                    <div
                      key={i}
                      className={`rounded-md bg-muted/50 p-3 pl-4 ${styles.border}`}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge className={`text-xs ${styles.badge}`}>
                            {suggestion.priority.toUpperCase()}
                          </Badge>
                          <p className="text-sm font-medium">{suggestion.topic}</p>
                        </div>
                        <Link
                          href="/posts/new"
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Plus className="h-3 w-3" />
                          Create Post
                        </Link>
                      </div>
                      <p className="mb-1 text-xs text-muted-foreground">{suggestion.reason}</p>
                      <p className="text-xs italic text-muted-foreground/80">
                        💡 {suggestion.contentIdea}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
