"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, CalendarRange, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlannerDayColumn } from "@/components/planner-day-column";
import { toast } from "sonner";

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

interface PlannerDay {
  date: string;
  dayOfWeek: string;
  posts: PlannerPost[];
  dailyGoal: GoalSummary | null;
  weeklyGoal: GoalSummary | null;
}

interface PlannerData {
  weekStart: string;
  weekEnd: string;
  days: PlannerDay[];
}

/** Returns "YYYY-MM-DD" for today in UTC */
function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Add/subtract weeks from a "YYYY-MM-DD" string, returning new "YYYY-MM-DD" */
function shiftWeek(dateStr: string, weeks: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

function formatWeekRange(weekStart: string, weekEnd: string): string {
  const start = new Date(`${weekStart}T00:00:00Z`);
  const end = new Date(`${weekEnd}T00:00:00Z`);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };
  return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, { ...opts, year: "numeric" })}`;
}

function isToday(dateStr: string): boolean {
  return dateStr === todayString();
}

export default function PlannerPage() {
  const [weekOf, setWeekOf] = useState<string>(todayString());
  const [data, setData] = useState<PlannerData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPlanner = useCallback(async (week: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/planner?weekOf=${week}`);
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to load planner");
      }
      const plannerData = (await res.json()) as PlannerData;
      setData(plannerData);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load planner");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPlanner(weekOf);
  }, [fetchPlanner, weekOf]);

  function goToPrevWeek() {
    setWeekOf((prev) => shiftWeek(prev, -1));
  }

  function goToNextWeek() {
    setWeekOf((prev) => shiftWeek(prev, 1));
  }

  function goToCurrentWeek() {
    setWeekOf(todayString());
  }

  return (
    <div className="flex flex-col gap-6 p-8 min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <CalendarRange className="h-8 w-8 text-primary" />
            Weekly Planner
          </h1>
          <p className="text-muted-foreground mt-1">
            Visualize your posting schedule and track daily goals.
          </p>
        </div>

        {/* Week navigation */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={goToPrevWeek} aria-label="Previous week">
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="text-sm font-medium min-w-[180px] text-center">
            {data
              ? formatWeekRange(data.weekStart, data.weekEnd)
              : loading
                ? "Loading…"
                : "—"}
          </div>

          <Button variant="outline" size="icon" onClick={goToNextWeek} aria-label="Next week">
            <ChevronRight className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={goToCurrentWeek}
            className="ml-1"
          >
            Today
          </Button>
        </div>
      </div>

      {/* Weekly goal summary banner */}
      {data && data.days[0]?.weeklyGoal && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
          <span className="text-sm font-medium text-foreground">Weekly goal:</span>
          <div className="flex-1 max-w-xs">
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={
                  data.days[0].weeklyGoal.onTrack
                    ? "h-full rounded-full bg-green-500 transition-all"
                    : "h-full rounded-full bg-amber-400 transition-all"
                }
                style={{
                  width: `${Math.min(
                    100,
                    Math.round(
                      (data.days[0].weeklyGoal.achieved / data.days[0].weeklyGoal.target) * 100
                    )
                  )}%`,
                }}
              />
            </div>
          </div>
          <span className="text-sm text-muted-foreground">
            {data.days[0].weeklyGoal.achieved} / {data.days[0].weeklyGoal.target} posts
            {data.days[0].weeklyGoal.onTrack && (
              <span className="ml-1.5 text-green-600 dark:text-green-400 font-semibold">✓ On track</span>
            )}
          </span>
        </div>
      )}

      {/* 7-column week grid */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground py-24">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading planner…</span>
        </div>
      ) : data ? (
        <div className="grid grid-cols-7 gap-3">
          {data.days.map((day) => (
            <PlannerDayColumn
              key={day.date}
              date={day.date}
              dayOfWeek={day.dayOfWeek}
              posts={day.posts}
              dailyGoal={day.dailyGoal}
              weeklyGoal={day.weeklyGoal}
              isToday={isToday(day.date)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-muted-foreground py-24">
          No data available.
        </div>
      )}
    </div>
  );
}
