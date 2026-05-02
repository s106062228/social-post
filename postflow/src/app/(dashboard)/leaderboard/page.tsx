"use client";

import { useState, useEffect, useCallback } from "react";
import { Trophy, TrendingUp, Eye, Heart, MessageSquare, Share2 } from "lucide-react";
import { scoreLabel } from "@/lib/content-score";

type Period = "7d" | "30d" | "90d" | "all";

interface PlatformEntry {
  platform: string;
  publishedUrl: string | null;
  publishedAt: string | null;
  score: number;
}

interface RankedPost {
  rank: number;
  postId: string;
  contentPreview: string;
  mediaType: string;
  createdAt: string;
  totalScore: number;
  totals: {
    impressions: number;
    reach: number;
    likes: number;
    comments: number;
    shares: number;
  };
  platforms: PlatformEntry[];
}

interface LeaderboardData {
  period: Period;
  limit: number;
  ranked: RankedPost[];
}

const PERIOD_LABELS: Record<Period, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
};

const PLATFORM_COLORS: Record<string, string> = {
  FACEBOOK: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  INSTAGRAM: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  THREADS: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

const SCORE_COLORS: Record<string, string> = {
  none: "bg-gray-100 text-gray-600",
  low: "bg-yellow-100 text-yellow-700",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-green-100 text-green-700",
  viral: "bg-purple-100 text-purple-700",
};

const RANK_MEDALS: Record<number, string> = {
  1: "🥇",
  2: "🥈",
  3: "🥉",
};

export default function LeaderboardPage() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLeaderboard = useCallback(async (p: Period) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/leaderboard?period=${p}&limit=20`);
      if (!res.ok) throw new Error("Failed to load leaderboard");
      const json = await res.json() as LeaderboardData;
      setData(json);
    } catch {
      setError("Could not load leaderboard data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLeaderboard(period);
  }, [period, fetchLeaderboard]);

  const maxScore = data?.ranked[0]?.totalScore ?? 1;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Trophy className="h-6 w-6 text-yellow-500" />
          <div>
            <h1 className="text-2xl font-semibold">Performance Leaderboard</h1>
            <p className="text-sm text-muted-foreground">
              Top posts ranked by weighted engagement score
            </p>
          </div>
        </div>

        {/* Period selector */}
        <div className="flex gap-2 flex-wrap">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                period === p
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Score formula note */}
      <div className="rounded-lg border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
        <TrendingUp className="inline h-3.5 w-3.5 mr-1 mb-0.5" />
        Score = impressions×0.5 + reach×1 + likes×3 + shares×4 + comments×5
      </div>

      {/* Content */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          Loading…
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {!loading && !error && data && data.ranked.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <Trophy className="h-12 w-12 text-muted-foreground/40" />
          <p className="text-muted-foreground">
            No posts with synced insights for this period.
          </p>
          <p className="text-xs text-muted-foreground">
            Visit a post and click "Sync Now" on the insights panel to populate data.
          </p>
        </div>
      )}
      {!loading && !error && data && data.ranked.length > 0 && (
        <div className="space-y-3">
          {data.ranked.map((post) => {
            const label = scoreLabel(post.totalScore);
            const barWidth = Math.max(4, Math.round((post.totalScore / maxScore) * 100));

            return (
              <div
                key={post.postId}
                className="rounded-xl border bg-card p-4 space-y-3 hover:shadow-sm transition-shadow"
              >
                {/* Rank + score */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xl shrink-0">
                      {RANK_MEDALS[post.rank] ?? (
                        <span className="text-sm font-mono text-muted-foreground">
                          #{post.rank}
                        </span>
                      )}
                    </span>
                    <p className="text-sm text-card-foreground line-clamp-2">
                      {post.contentPreview}
                      {post.contentPreview.length >= 120 && "…"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${SCORE_COLORS[label]}`}
                  >
                    {post.totalScore.toLocaleString()} pts
                  </span>
                </div>

                {/* Score bar */}
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>

                {/* Metrics */}
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Eye className="h-3.5 w-3.5" />
                    {post.totals.impressions.toLocaleString()} impressions
                  </span>
                  <span className="flex items-center gap-1">
                    <TrendingUp className="h-3.5 w-3.5" />
                    {post.totals.reach.toLocaleString()} reach
                  </span>
                  <span className="flex items-center gap-1">
                    <Heart className="h-3.5 w-3.5" />
                    {post.totals.likes.toLocaleString()} likes
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {post.totals.comments.toLocaleString()} comments
                  </span>
                  <span className="flex items-center gap-1">
                    <Share2 className="h-3.5 w-3.5" />
                    {post.totals.shares.toLocaleString()} shares
                  </span>
                </div>

                {/* Platforms */}
                <div className="flex flex-wrap gap-2">
                  {post.platforms.map((p) => (
                    <span
                      key={p.platform}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        PLATFORM_COLORS[p.platform] ?? "bg-muted text-muted-foreground"
                      }`}
                    >
                      {p.platform.charAt(0) + p.platform.slice(1).toLowerCase()}
                      {" "}·{" "}
                      {p.score.toLocaleString()} pts
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
