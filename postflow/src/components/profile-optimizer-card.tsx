"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Target,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Lightbulb,
} from "lucide-react";
import type {
  ProfileOptimizerResponse,
  ProfileOptimizationData,
} from "@/app/api/analytics/profile-optimizer/route";
import type { ProfileGrade } from "@/lib/profile-optimizer";
import { cn } from "@/lib/utils";

// ── Helpers ───────────────────────────────────────────────────────────────────

const PLATFORM_LABELS: Record<string, string> = {
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  THREADS: "Threads",
  LINKEDIN: "LinkedIn",
  PINTEREST: "Pinterest",
  YOUTUBE: "YouTube",
  TIKTOK: "TikTok",
  TWITTER: "X (Twitter)",
  BLUESKY: "Bluesky",
  MASTODON: "Mastodon",
  TELEGRAM: "Telegram",
  TUMBLR: "Tumblr",
  WORDPRESS: "WordPress",
  MEDIUM: "Medium",
  GHOST: "Ghost",
  DEVTO: "Dev.to",
  HASHNODE: "Hashnode",
  NOSTR: "Nostr",
  REDDIT: "Reddit",
  PIXELFED: "Pixelfed",
  VIMEO: "Vimeo",
  BEEHIIV: "Beehiiv",
  GOOGLE_BUSINESS: "Google Business",
};

const GRADE_COLORS: Record<ProfileGrade, string> = {
  A: "bg-green-500 text-white",
  B: "bg-blue-500 text-white",
  C: "bg-yellow-500 text-white",
  D: "bg-orange-500 text-white",
  F: "bg-red-500 text-white",
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "text-red-600 dark:text-red-400",
  medium: "text-yellow-600 dark:text-yellow-400",
  low: "text-blue-600 dark:text-blue-400",
};

function ScoreBar({
  score,
  max,
  label,
}: {
  score: number;
  max: number;
  label: string;
}) {
  const pct = max > 0 ? (score / max) * 100 : 0;
  const color =
    pct >= 85
      ? "bg-green-500"
      : pct >= 65
      ? "bg-blue-500"
      : pct >= 40
      ? "bg-yellow-500"
      : "bg-red-500";

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 bg-muted rounded-full h-2">
        <div
          className={cn("h-2 rounded-full transition-all", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-16 text-right text-xs text-muted-foreground">
        {score}/{max} · {label}
      </span>
    </div>
  );
}

function AccountCard({ data }: { data: ProfileOptimizationData }) {
  const [expanded, setExpanded] = useState(false);
  const { score } = data;

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header row */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors text-left"
      >
        {/* Grade circle */}
        <div
          className={cn(
            "h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0",
            GRADE_COLORS[score.grade]
          )}
        >
          {score.grade}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{data.accountName}</span>
            <Badge variant="outline" className="text-xs">
              {PLATFORM_LABELS[data.platform] ?? data.platform}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Score: {score.overallScore}/100
          </div>
        </div>

        {/* Tips count */}
        {score.tips.length > 0 && (
          <Badge
            variant="secondary"
            className="text-xs flex-shrink-0"
          >
            {score.tips.length} tip{score.tips.length !== 1 ? "s" : ""}
          </Badge>
        )}

        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t px-4 pb-4 pt-3 space-y-4">
          {/* Dimension score bars */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Score Breakdown
            </p>
            {score.dimensions.map((dim) => (
              <div key={dim.name}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium">{dim.name}</span>
                </div>
                <ScoreBar score={dim.score} max={dim.max} label={dim.label} />
              </div>
            ))}
          </div>

          {/* Tips */}
          {score.tips.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Recommendations
              </p>
              {score.tips.map((tip, i) => (
                <div
                  key={i}
                  className="flex gap-2 p-2 rounded-md bg-muted/40 text-sm"
                >
                  <Lightbulb
                    className={cn(
                      "h-4 w-4 flex-shrink-0 mt-0.5",
                      PRIORITY_COLORS[tip.priority]
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs">{tip.tip}</p>
                    <p
                      className={cn(
                        "text-xs font-medium mt-1",
                        PRIORITY_COLORS[tip.priority]
                      )}
                    >
                      → {tip.action}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn("text-xs flex-shrink-0 h-fit", {
                      "border-red-400 text-red-600": tip.priority === "high",
                      "border-yellow-400 text-yellow-600":
                        tip.priority === "medium",
                      "border-blue-400 text-blue-600": tip.priority === "low",
                    })}
                  >
                    {tip.priority}
                  </Badge>
                </div>
              ))}
            </div>
          )}

          {score.tips.length === 0 && (
            <p className="text-sm text-green-600 dark:text-green-400">
              ✓ All dimensions are performing well. Keep it up!
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ProfileOptimizerCard() {
  const [data, setData] = useState<ProfileOptimizerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analytics/profile-optimizer");
      if (!res.ok) throw new Error("Failed to load data");
      const json = (await res.json()) as ProfileOptimizerResponse;
      setData(json);
    } catch {
      setError("Could not load profile optimizer data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const needsAttention =
    data?.accounts.filter(
      (a) => a.score.grade === "D" || a.score.grade === "F"
    ).length ?? 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-indigo-500" />
            Profile Optimizer
          </CardTitle>
          <CardDescription>
            Per-account scoring across Activity, Engagement, Growth, and
            Consistency
          </CardDescription>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void fetchData()}
          disabled={loading}
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </CardHeader>

      <CardContent>
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive text-center py-4">{error}</p>
        )}

        {!loading && !error && data && (
          <>
            {/* Fleet summary */}
            {data.fleetScore !== null && (
              <div className="flex items-center justify-between mb-4 p-3 bg-muted/40 rounded-lg">
                <div>
                  <p className="text-sm font-medium">Fleet Average Score</p>
                  <p className="text-xs text-muted-foreground">
                    {needsAttention > 0
                      ? `${needsAttention} account${needsAttention !== 1 ? "s" : ""} need${needsAttention === 1 ? "s" : ""} attention`
                      : "All accounts performing well"}
                  </p>
                </div>
                <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                  {data.fleetScore}
                  <span className="text-sm text-muted-foreground font-normal">
                    /100
                  </span>
                </div>
              </div>
            )}

            {/* Account cards */}
            {data.accounts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Target className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No connected accounts found.</p>
                <p className="text-xs mt-1">
                  Connect social accounts to see optimization scores.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {data.accounts.map((account) => (
                  <AccountCard key={account.accountId} data={account} />
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
