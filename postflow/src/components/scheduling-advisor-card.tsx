"use client";

import { useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, RefreshCw, AlertCircle } from "lucide-react";
import type { ScheduleRecommendation } from "@/lib/ai";

const PRIORITY_STYLES: Record<
  ScheduleRecommendation["priority"],
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

export function SchedulingAdvisorCard() {
  const [recs, setRecs] = useState<ScheduleRecommendation[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAdvice = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/schedule-advice", { method: "POST" });
      if (res.status === 503) {
        setError("AI features are not configured.");
        return;
      }
      if (!res.ok) throw new Error("Failed to fetch");
      const json = (await res.json()) as { recommendations: ScheduleRecommendation[] };
      setRecs(json.recommendations);
    } catch {
      setError("Could not load recommendations. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle>AI Scheduling Advisor</CardTitle>
              <CardDescription className="mt-1">
                Personalized recommendations based on your posting history
              </CardDescription>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchAdvice()}
            disabled={loading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {recs ? "Refresh" : "Get Advice"}
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

        {!recs && !error && !loading && (
          <p className="text-sm text-muted-foreground">
            Click &quot;Get Advice&quot; to receive AI-powered scheduling recommendations
            tailored to your account.
          </p>
        )}

        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-md bg-muted animate-pulse" />
            ))}
          </div>
        )}

        {recs && recs.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No recommendations available. Try publishing more posts to gather data.
          </p>
        )}

        {recs && recs.length > 0 && (
          <div className="space-y-3">
            {recs.map((rec, i) => {
              const styles = PRIORITY_STYLES[rec.priority];
              return (
                <div
                  key={i}
                  className={`rounded-md bg-muted/50 p-3 pl-4 ${styles.border}`}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <Badge className={`text-xs ${styles.badge}`}>
                      {rec.priority.toUpperCase()}
                    </Badge>
                    <p className="text-sm font-medium">{rec.insight}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">{rec.action}</p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
