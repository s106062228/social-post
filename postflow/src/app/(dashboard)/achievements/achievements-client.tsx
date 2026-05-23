"use client";

import { useState, useEffect, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ACHIEVEMENT_TYPES, type AchievementType } from "@/lib/achievements";
import { RefreshCw } from "lucide-react";

interface AchievementItem {
  type: string;
  label: string;
  description: string;
  icon: string;
  earned: boolean;
  awardedAt: string | null;
}

const ICON_MAP: Record<AchievementType, string> = {
  FIRST_POST: "🌟",
  TEN_POSTS: "📝",
  FIFTY_POSTS: "📊",
  HUNDRED_POSTS: "💯",
  FIRST_PUBLISH: "🚀",
  FIRST_SCHEDULE: "⏰",
  MULTI_PLATFORM: "🌐",
  CONSISTENT_POSTER: "🔄",
  HIGH_ENGAGER: "🔥",
  FIRST_CAMPAIGN: "📣",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function AchievementsClient() {
  const [achievements, setAchievements] = useState<AchievementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    fetch("/api/achievements")
      .then((r) => r.json())
      .then((data: { achievements: AchievementItem[] }) => {
        setAchievements(data.achievements);
      })
      .catch(() => {
        toast({ title: "Failed to load achievements", variant: "destructive" });
      })
      .finally(() => setLoading(false));
  }, []);

  function handleCheck() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/achievements/check", { method: "POST" });
        if (!res.ok) {
          toast({ title: "Failed to check achievements", variant: "destructive" });
          return;
        }
        const data = (await res.json()) as { awarded: string[] };

        if (data.awarded.length === 0) {
          toast({ title: "No new achievements", description: "Keep posting to unlock more!" });
        } else {
          const labels = data.awarded
            .map((type) => ACHIEVEMENT_TYPES[type as AchievementType]?.label ?? type)
            .join(", ");
          toast({
            title: `Unlocked ${data.awarded.length} achievement${data.awarded.length > 1 ? "s" : ""}!`,
            description: labels,
            variant: "success",
          });
        }

        const refreshRes = await fetch("/api/achievements");
        if (refreshRes.ok) {
          const refreshData = (await refreshRes.json()) as { achievements: AchievementItem[] };
          setAchievements(refreshData.achievements);
        }
      } catch {
        toast({ title: "Failed to check achievements", variant: "destructive" });
      }
    });
  }

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="h-40 rounded-lg border border-dashed bg-muted/30 animate-pulse"
          />
        ))}
      </div>
    );
  }

  const earnedCount = achievements.filter((a) => a.earned).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {earnedCount} / {achievements.length} earned
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCheck}
          disabled={isPending}
        >
          <RefreshCw className={cn("mr-2 h-4 w-4", isPending && "animate-spin")} />
          Check for new achievements
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {achievements.map((achievement) => (
          <div
            key={achievement.type}
            className={cn(
              "flex flex-col items-center gap-2 rounded-lg border p-4 text-center transition-colors",
              achievement.earned
                ? "border-green-500/60 bg-green-50/50 dark:bg-green-950/20"
                : "border-dashed border-muted-foreground/30 bg-muted/20 opacity-60"
            )}
          >
            <span className="text-4xl" role="img" aria-label={achievement.label}>
              {ICON_MAP[achievement.type as AchievementType] ?? "🏅"}
            </span>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold leading-tight">{achievement.label}</p>
              <p className="text-xs text-muted-foreground leading-snug">
                {achievement.description}
              </p>
            </div>
            {achievement.earned && achievement.awardedAt && (
              <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                {formatDate(achievement.awardedAt)}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
