"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TrendingUp,
  RefreshCw,
  PenLine,
  Zap,
  Clock,
  Calendar,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

interface TrendingTopic {
  topic: string;
  category: string;
  urgency: "now" | "this_week" | "this_month";
  reasoning: string;
  contentIdea: string;
  estimatedEngagement: "high" | "medium" | "low";
}

interface TrendingTopicsCardProps {
  defaultNiche?: string;
  defaultPlatforms?: string[];
}

const URGENCY_CONFIG: Record<
  "now" | "this_week" | "this_month",
  { label: string; Icon: typeof Zap; cls: string }
> = {
  now: { label: "Trending Now", Icon: Zap, cls: "border-red-200 bg-red-50 text-red-700" },
  this_week: { label: "This Week", Icon: Clock, cls: "border-amber-200 bg-amber-50 text-amber-700" },
  this_month: { label: "This Month", Icon: Calendar, cls: "border-blue-200 bg-blue-50 text-blue-700" },
};

const ENGAGEMENT_CLS: Record<"high" | "medium" | "low", string> = {
  high: "text-green-600",
  medium: "text-amber-600",
  low: "text-slate-500",
};

const ENGAGEMENT_LABEL: Record<"high" | "medium" | "low", string> = {
  high: "↑ High engagement",
  medium: "→ Medium engagement",
  low: "↓ Low engagement",
};

export function TrendingTopicsCard({
  defaultNiche = "",
  defaultPlatforms = ["FACEBOOK", "INSTAGRAM", "TWITTER"],
}: TrendingTopicsCardProps) {
  const [topics, setTopics] = useState<TrendingTopic[]>([]);
  const [generalInsights, setGeneralInsights] = useState("");
  const [niche, setNiche] = useState(defaultNiche);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  async function discover() {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/trending-topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ niche, platforms: defaultPlatforms }),
      });
      if (res.status === 503) {
        toast.error("AI service not configured");
        return;
      }
      if (!res.ok) {
        toast.error("Failed to discover topics");
        return;
      }
      const data = (await res.json()) as {
        topics: TrendingTopic[];
        generalInsights: string;
      };
      setTopics(data.topics ?? []);
      setGeneralInsights(data.generalInsights ?? "");
      setHasLoaded(true);
    } catch {
      toast.error("Failed to discover topics");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4" />
          Trending Topic Discovery
        </CardTitle>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Your niche (e.g. fitness)"
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            className="h-8 w-44 rounded-md border border-input bg-background px-3 text-sm"
          />
          <Button size="sm" variant="outline" onClick={discover} disabled={loading}>
            <RefreshCw className={`mr-1 h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            {hasLoaded ? "Refresh" : "Discover"}
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {!hasLoaded && !loading && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <TrendingUp className="mx-auto mb-2 h-8 w-8 opacity-30" />
            <p>Enter your niche and click &quot;Discover&quot; to find trending topics</p>
            <p className="mt-1 text-xs">
              Powered by AI — surfaces topics you should be creating content about
            </p>
          </div>
        )}

        {loading && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <RefreshCw className="mx-auto mb-2 h-6 w-6 animate-spin opacity-50" />
            <p>Discovering trending topics…</p>
          </div>
        )}

        {hasLoaded && !loading && (
          <div className="space-y-4">
            {generalInsights && (
              <div className="rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">
                <p className="mb-1 font-medium text-foreground">💡 Strategy Insight</p>
                <p>{generalInsights}</p>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              {topics.map((topic, i) => {
                const { label, Icon, cls } = URGENCY_CONFIG[topic.urgency] ?? URGENCY_CONFIG.this_month;
                return (
                  <div
                    key={i}
                    className="space-y-2 rounded-lg border p-3 transition-colors hover:bg-muted/30"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-tight">{topic.topic}</p>
                      <Badge variant="outline" className={`shrink-0 text-xs ${cls}`}>
                        <Icon className="mr-1 h-3 w-3" />
                        {label}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {topic.category}
                      </Badge>
                      <span
                        className={`text-xs font-medium ${
                          ENGAGEMENT_CLS[topic.estimatedEngagement] ?? "text-slate-500"
                        }`}
                      >
                        {ENGAGEMENT_LABEL[topic.estimatedEngagement] ?? ""}
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground">{topic.reasoning}</p>

                    <div className="rounded border-l-2 border-primary/40 bg-muted/50 p-2 text-xs">
                      <span className="font-medium">Idea: </span>
                      {topic.contentIdea}
                    </div>

                    <Link
                      href={`/posts/new?content=${encodeURIComponent(topic.contentIdea)}`}
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <PenLine className="h-3 w-3" />
                      Create post about this
                    </Link>
                  </div>
                );
              })}
            </div>

            {topics.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">No topics found</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
