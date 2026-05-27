"use client";

import { useState, useEffect, useCallback } from "react";
import {
  TrendingUp,
  Plus,
  Trash2,
  Loader2,
  Pause,
  Play,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type GoalPeriod = "DAILY" | "WEEKLY" | "MONTHLY";
type Platform =
  | "FACEBOOK"
  | "INSTAGRAM"
  | "THREADS"
  | "LINKEDIN"
  | "TWITTER"
  | "TIKTOK"
  | "YOUTUBE"
  | "REDDIT"
  | "BLUESKY"
  | "MASTODON";
type EngagementMetric =
  | "IMPRESSIONS"
  | "REACH"
  | "LIKES"
  | "COMMENTS"
  | "SHARES"
  | "SCORE";
type EngagementAggregation = "TOTAL" | "AVERAGE";

interface EngagementGoal {
  id: string;
  name: string;
  metric: EngagementMetric;
  targetValue: number;
  aggregation: EngagementAggregation;
  period: GoalPeriod;
  platform: Platform | null;
  isActive: boolean;
  lastNotifiedAt: string | null;
  createdAt: string;
}

interface GoalProgress {
  goalId: string;
  name: string;
  metric: EngagementMetric;
  aggregation: EngagementAggregation;
  period: GoalPeriod;
  platform: Platform | null;
  targetValue: number;
  currentValue: number;
  percentage: number;
  onTrack: boolean;
  sampleSize: number;
}

const PERIOD_LABELS: Record<GoalPeriod, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
};

const METRIC_LABELS: Record<EngagementMetric, string> = {
  IMPRESSIONS: "Impressions",
  REACH: "Reach",
  LIKES: "Likes",
  COMMENTS: "Comments",
  SHARES: "Shares",
  SCORE: "Engagement Score",
};

const AGGREGATION_LABELS: Record<EngagementAggregation, string> = {
  TOTAL: "Total",
  AVERAGE: "Avg per post",
};

const PLATFORM_LABELS: Partial<Record<Platform, string>> = {
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  THREADS: "Threads",
  LINKEDIN: "LinkedIn",
  TWITTER: "X (Twitter)",
  TIKTOK: "TikTok",
  YOUTUBE: "YouTube",
  REDDIT: "Reddit",
  BLUESKY: "Bluesky",
  MASTODON: "Mastodon",
};

function CircularProgress({
  percentage,
  size = 80,
}: {
  percentage: number;
  size?: number;
}) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const dashOffset = circ - (percentage / 100) * circ;
  const color =
    percentage >= 100
      ? "#22c55e"
      : percentage >= 60
        ? "#3b82f6"
        : percentage >= 30
          ? "#f59e0b"
          : "#ef4444";

  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={6}
        className="text-muted-foreground/20"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeDasharray={circ}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.5s ease" }}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fontSize={size * 0.2}
        fill={color}
        style={{ transform: "rotate(90deg)", transformOrigin: "center" }}
        className="rotate-90"
      >
        {percentage}%
      </text>
    </svg>
  );
}

export default function EngagementGoalsPage() {
  const [goals, setGoals] = useState<EngagementGoal[]>([]);
  const [progress, setProgress] = useState<GoalProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [metric, setMetric] = useState<EngagementMetric>("LIKES");
  const [targetValue, setTargetValue] = useState("");
  const [aggregation, setAggregation] = useState<EngagementAggregation>("AVERAGE");
  const [period, setPeriod] = useState<GoalPeriod>("WEEKLY");
  const [platform, setPlatform] = useState<Platform | "">("");

  const fetchData = useCallback(async () => {
    try {
      const [goalsRes, progressRes] = await Promise.all([
        fetch("/api/engagement-goals"),
        fetch("/api/engagement-goals/progress"),
      ]);
      if (goalsRes.ok) {
        const { goals: g } = (await goalsRes.json()) as { goals: EngagementGoal[] };
        setGoals(g);
      }
      if (progressRes.ok) {
        const { progress: p } = (await progressRes.json()) as { progress: GoalProgress[] };
        setProgress(p);
      }
    } catch {
      toast.error("Failed to load engagement goals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleCreate = async () => {
    if (!name.trim() || !targetValue) return;
    setCreating(true);
    try {
      const res = await fetch("/api/engagement-goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          metric,
          targetValue: parseFloat(targetValue),
          aggregation,
          period,
          platform: platform || null,
        }),
      });
      if (!res.ok) {
        const { error } = (await res.json()) as { error: string };
        toast.error(error);
        return;
      }
      toast.success("Engagement goal created");
      setName("");
      setTargetValue("");
      setMetric("LIKES");
      setAggregation("AVERAGE");
      setPeriod("WEEKLY");
      setPlatform("");
      setShowForm(false);
      await fetchData();
    } catch {
      toast.error("Failed to create engagement goal");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this engagement goal?")) return;
    try {
      const res = await fetch(`/api/engagement-goals/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Goal deleted");
        await fetchData();
      } else {
        toast.error("Failed to delete goal");
      }
    } catch {
      toast.error("Failed to delete goal");
    }
  };

  const handleToggle = async (id: string) => {
    try {
      const res = await fetch(`/api/engagement-goals/${id}/toggle`, {
        method: "POST",
      });
      if (res.ok) {
        const { isActive } = (await res.json()) as { isActive: boolean };
        toast.success(isActive ? "Goal activated" : "Goal paused");
        await fetchData();
      } else {
        toast.error("Failed to update goal");
      }
    } catch {
      toast.error("Failed to update goal");
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const progressMap = new Map(progress.map((p) => [p.goalId, p]));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TrendingUp className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Engagement Goals</h1>
            <p className="text-sm text-muted-foreground">
              Track your engagement targets (likes, reach, comments, etc.) over
              daily, weekly, or monthly periods.
            </p>
          </div>
        </div>
        <Button onClick={() => setShowForm((v) => !v)} size="sm" className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add Goal
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New Engagement Goal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm font-medium">Goal Name</label>
                <Input
                  placeholder="e.g. 500 likes per week"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Metric</label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={metric}
                  onChange={(e) => setMetric(e.target.value as EngagementMetric)}
                >
                  {Object.entries(METRIC_LABELS).map(([val, lbl]) => (
                    <option key={val} value={val}>
                      {lbl}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Target Value</label>
                <Input
                  type="number"
                  min="0.01"
                  placeholder="e.g. 500"
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Aggregation</label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={aggregation}
                  onChange={(e) =>
                    setAggregation(e.target.value as EngagementAggregation)
                  }
                >
                  {Object.entries(AGGREGATION_LABELS).map(([val, lbl]) => (
                    <option key={val} value={val}>
                      {lbl}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Period</label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as GoalPeriod)}
                >
                  {Object.entries(PERIOD_LABELS).map(([val, lbl]) => (
                    <option key={val} value={val}>
                      {lbl}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">
                  Platform{" "}
                  <span className="text-muted-foreground">(optional)</span>
                </label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value as Platform | "")}
                >
                  <option value="">All platforms</option>
                  {Object.entries(PLATFORM_LABELS).map(([val, lbl]) => (
                    <option key={val} value={val}>
                      {lbl}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleCreate}
                disabled={creating || !name.trim() || !targetValue}
                size="sm"
              >
                {creating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Create Goal
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Goals list */}
      {goals.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Target className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <h2 className="text-lg font-semibold">No engagement goals yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Set targets for likes, reach, comments, and more to track your
              social media engagement.
            </p>
            <Button
              className="mt-4"
              size="sm"
              onClick={() => setShowForm(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Create your first goal
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map((goal) => {
            const prog = progressMap.get(goal.id);
            const pct = prog?.percentage ?? 0;
            const current = prog?.currentValue ?? 0;
            const samples = prog?.sampleSize ?? 0;

            return (
              <Card
                key={goal.id}
                className={
                  !goal.isActive ? "opacity-60" : ""
                }
              >
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold truncate">{goal.name}</h3>
                        {!goal.isActive && (
                          <Badge variant="secondary">Paused</Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge variant="outline" className="text-xs">
                          {METRIC_LABELS[goal.metric]}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {AGGREGATION_LABELS[goal.aggregation]}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {PERIOD_LABELS[goal.period]}
                        </Badge>
                        {goal.platform && (
                          <Badge variant="outline" className="text-xs">
                            {PLATFORM_LABELS[goal.platform] ?? goal.platform}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {goal.isActive && (
                      <CircularProgress percentage={pct} size={72} />
                    )}
                  </div>

                  {goal.isActive && (
                    <div className="mt-3 space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-medium">
                          {current.toLocaleString()} /{" "}
                          {goal.targetValue.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {samples} post{samples !== 1 ? "s" : ""} with data
                        </span>
                        {prog?.onTrack && (
                          <span className="text-green-600 font-medium">
                            ✓ Goal reached!
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="mt-4 flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => handleToggle(goal.id)}
                    >
                      {goal.isActive ? (
                        <>
                          <Pause className="mr-1 h-3 w-3" /> Pause
                        </>
                      ) : (
                        <>
                          <Play className="mr-1 h-3 w-3" /> Resume
                        </>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(goal.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
