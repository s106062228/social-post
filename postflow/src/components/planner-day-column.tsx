"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type PostStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "PUBLISHING"
  | "PUBLISHED"
  | "PARTIALLY_PUBLISHED"
  | "FAILED";

interface PlannerPost {
  id: string;
  content: string;
  status: PostStatus;
  mediaType: string;
  scheduledAt: string;
  platforms: string[];
}

interface GoalSummary {
  target: number;
  achieved: number;
  onTrack: boolean;
}

interface PlannerDayColumnProps {
  date: string;
  dayOfWeek: string;
  posts: PlannerPost[];
  dailyGoal: GoalSummary | null;
  weeklyGoal: GoalSummary | null;
  isToday?: boolean;
}

const STATUS_COLORS: Record<PostStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  SCHEDULED: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  PUBLISHING: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  PUBLISHED: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  PARTIALLY_PUBLISHED: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  FAILED: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

const PLATFORM_ABBREV: Record<string, string> = {
  FACEBOOK: "FB",
  INSTAGRAM: "IG",
  THREADS: "TH",
  LINKEDIN: "LI",
  PINTEREST: "PI",
  YOUTUBE: "YT",
  TIKTOK: "TK",
  TWITTER: "TW",
  BLUESKY: "BS",
  MASTODON: "MA",
  TELEGRAM: "TG",
  REDDIT: "RD",
  NOSTR: "NO",
  TUMBLR: "TU",
  WORDPRESS: "WP",
  MEDIUM: "ME",
  GHOST: "GH",
  DEVTO: "DV",
  GOOGLE_BUSINESS: "GB",
  HASHNODE: "HN",
  BEEHIIV: "BH",
};

function formatTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatDayHeader(date: string, dayOfWeek: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDate();
  return `${dayOfWeek.slice(0, 3)} ${day}`;
}

export function PlannerDayColumn({
  date,
  dayOfWeek,
  posts,
  dailyGoal,
  isToday = false,
}: PlannerDayColumnProps) {
  const goalPct = dailyGoal
    ? Math.min(100, Math.round((dailyGoal.achieved / dailyGoal.target) * 100))
    : null;

  return (
    <div
      className={cn(
        "flex flex-col gap-2 min-h-[320px] rounded-lg border p-3",
        isToday
          ? "border-primary bg-primary/5"
          : "border-border bg-card"
      )}
    >
      {/* Day header */}
      <div className="flex items-center justify-between mb-1">
        <span
          className={cn(
            "text-sm font-semibold",
            isToday ? "text-primary" : "text-foreground"
          )}
        >
          {formatDayHeader(date, dayOfWeek)}
        </span>
        <Link
          href="/posts"
          className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
          title="New post"
        >
          <Plus className="h-3 w-3" />
        </Link>
      </div>

      {/* Daily goal progress bar */}
      {dailyGoal && goalPct !== null ? (
        <div className="flex flex-col gap-0.5 mb-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {dailyGoal.achieved}/{dailyGoal.target} goal
            </span>
            {dailyGoal.onTrack && (
              <span className="text-green-600 dark:text-green-400 font-medium">✓</span>
            )}
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                dailyGoal.onTrack
                  ? "bg-green-500"
                  : goalPct >= 50
                    ? "bg-amber-400"
                    : "bg-amber-300"
              )}
              style={{ width: `${goalPct}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground/50 mb-1">No goal</div>
      )}

      {/* Post cards */}
      <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
        {posts.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground/40 py-4">
            No posts
          </div>
        ) : (
          posts.map((post) => (
            <div
              key={post.id}
              className="rounded-md border border-border bg-background p-2 hover:border-primary/50 transition-colors cursor-default"
            >
              {/* Time */}
              <div className="text-xs text-muted-foreground mb-0.5">
                {formatTime(post.scheduledAt)}
              </div>
              {/* Content */}
              <p className="text-xs text-foreground leading-snug line-clamp-2 mb-1">
                {post.content.length > 60
                  ? post.content.slice(0, 57) + "…"
                  : post.content}
              </p>
              {/* Status + platforms */}
              <div className="flex flex-wrap items-center gap-1">
                <span
                  className={cn(
                    "rounded px-1 py-0.5 text-[10px] font-medium",
                    STATUS_COLORS[post.status] ?? STATUS_COLORS.DRAFT
                  )}
                >
                  {post.status === "PARTIALLY_PUBLISHED" ? "PARTIAL" : post.status}
                </span>
                {post.platforms.slice(0, 3).map((p) => (
                  <span
                    key={p}
                    className="rounded bg-muted px-1 py-0.5 text-[10px] font-mono text-muted-foreground"
                    title={p}
                  >
                    {PLATFORM_ABBREV[p] ?? p.slice(0, 2)}
                  </span>
                ))}
                {post.platforms.length > 3 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{post.platforms.length - 3}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
