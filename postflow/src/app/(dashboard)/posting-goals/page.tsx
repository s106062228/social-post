"use client";

import { useState, useEffect, useCallback } from "react";
import { Target, Plus, Trash2, Loader2, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type GoalPeriod = "DAILY" | "WEEKLY" | "MONTHLY";
type Platform = "FACEBOOK" | "INSTAGRAM" | "THREADS";

interface PostingGoal {
  id: string;
  name: string;
  targetCount: number;
  period: GoalPeriod;
  platform: Platform | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface GoalProgress {
  goalId: string;
  name: string;
  period: GoalPeriod;
  platform: Platform | null;
  targetCount: number;
  publishedCount: number;
  percentage: number;
  onTrack: boolean;
}

const PERIOD_LABELS: Record<GoalPeriod, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
};

const PLATFORM_LABELS: Record<Platform, string> = {
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  THREADS: "Threads",
};

function CircularProgress({ percentage, size = 80 }: { percentage: number; size?: number }) {
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
        style={{ transition: "stroke-dashoffset 0.4s ease" }}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="middle"
        textAnchor="middle"
        fontSize={size * 0.22}
        fontWeight="600"
        fill="currentColor"
        style={{ transform: "rotate(90deg)", transformOrigin: "50% 50%" }}
      >
        {percentage}%
      </text>
    </svg>
  );
}

export default function PostingGoalsPage() {
  const [goals, setGoals] = useState<PostingGoal[]>([]);
  const [progress, setProgress] = useState<GoalProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formTarget, setFormTarget] = useState("5");
  const [formPeriod, setFormPeriod] = useState<GoalPeriod>("WEEKLY");
  const [formPlatform, setFormPlatform] = useState<Platform | "">("");

  const fetchAll = useCallback(async () => {
    try {
      const [goalsRes, progressRes] = await Promise.all([
        fetch("/api/posting-goals"),
        fetch("/api/posting-goals/progress"),
      ]);
      if (!goalsRes.ok || !progressRes.ok) throw new Error("Failed to fetch");
      const goalsData = (await goalsRes.json()) as { goals: PostingGoal[] };
      const progressData = (await progressRes.json()) as { progress: GoalProgress[] };
      setGoals(goalsData.goals);
      setProgress(progressData.progress);
    } catch {
      toast.error("Failed to load posting goals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const target = parseInt(formTarget, 10);
    if (!formName.trim() || isNaN(target) || target < 1) return;
    setCreating(true);
    try {
      const res = await fetch("/api/posting-goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          targetCount: target,
          period: formPeriod,
          platform: formPlatform || null,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to create");
      }
      toast.success("Goal created");
      setFormName("");
      setFormTarget("5");
      setFormPeriod("WEEKLY");
      setFormPlatform("");
      setShowForm(false);
      await fetchAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create goal");
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(id: string) {
    setTogglingId(id);
    try {
      const res = await fetch(`/api/posting-goals/${id}/toggle`, { method: "PATCH" });
      if (!res.ok) throw new Error("Failed to toggle");
      const data = (await res.json()) as { goal: { id: string; isActive: boolean } };
      setGoals((prev) =>
        prev.map((g) => (g.id === id ? { ...g, isActive: data.goal.isActive } : g))
      );
      toast.success(data.goal.isActive ? "Goal activated" : "Goal paused");
    } catch {
      toast.error("Failed to update goal");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/posting-goals/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setGoals((prev) => prev.filter((g) => g.id !== id));
      setProgress((prev) => prev.filter((p) => p.goalId !== id));
      toast.success("Goal deleted");
    } catch {
      toast.error("Failed to delete goal");
    } finally {
      setDeletingId(null);
    }
  }

  const progressMap = new Map(progress.map((p) => [p.goalId, p]));

  return (
    <div className="flex flex-col gap-6 p-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Posting Goals</h1>
          <p className="text-muted-foreground">
            Track your publishing targets and stay consistent.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Plus className="mr-2 h-4 w-4" />
          New Goal
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>New posting goal</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="flex flex-col gap-3">
              <Input
                placeholder="Goal name *"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                maxLength={100}
                required
              />
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Target posts
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={10000}
                    value={formTarget}
                    onChange={(e) => setFormTarget(e.target.value)}
                    required
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Period
                  </label>
                  <select
                    value={formPeriod}
                    onChange={(e) => setFormPeriod(e.target.value as GoalPeriod)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  >
                    <option value="DAILY">Daily</option>
                    <option value="WEEKLY">Weekly</option>
                    <option value="MONTHLY">Monthly</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Platform (optional — leave blank for all)
                </label>
                <select
                  value={formPlatform}
                  onChange={(e) => setFormPlatform(e.target.value as Platform | "")}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  <option value="">All platforms</option>
                  <option value="FACEBOOK">Facebook</option>
                  <option value="INSTAGRAM">Instagram</option>
                  <option value="THREADS">Threads</option>
                </select>
              </div>
              <div className="flex gap-2 pt-1">
                <Button type="submit" size="sm" disabled={creating || !formName.trim()}>
                  {creating && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                  Create goal
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Goals list */}
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading goals…
        </div>
      ) : goals.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Target className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-muted-foreground">
              No posting goals yet. Create one to start tracking your publishing cadence.
            </p>
            <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create goal
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map((goal) => {
            const prog = progressMap.get(goal.id);
            const pct = prog?.percentage ?? 0;
            const count = prog?.publishedCount ?? 0;

            return (
              <Card
                key={goal.id}
                className={goal.isActive ? "" : "opacity-60"}
              >
                <CardContent className="p-5 flex gap-4 items-start">
                  {/* Circular progress (active goals only) */}
                  {goal.isActive && prog ? (
                    <CircularProgress percentage={pct} />
                  ) : (
                    <div className="h-20 w-20 shrink-0 flex items-center justify-center rounded-full bg-muted text-muted-foreground/40">
                      <Pause className="h-6 w-6" />
                    </div>
                  )}

                  <div className="flex flex-1 flex-col gap-1 min-w-0">
                    <p className="font-semibold truncate">{goal.name}</p>

                    <div className="flex flex-wrap gap-1.5 mt-0.5">
                      <Badge variant="secondary" className="text-xs">
                        {PERIOD_LABELS[goal.period]}
                      </Badge>
                      {goal.platform && (
                        <Badge variant="outline" className="text-xs">
                          {PLATFORM_LABELS[goal.platform]}
                        </Badge>
                      )}
                      {!goal.isActive && (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          Paused
                        </Badge>
                      )}
                    </div>

                    {goal.isActive && prog ? (
                      <p className="text-sm text-muted-foreground">
                        {count} / {goal.targetCount} posts
                        {prog.onTrack && (
                          <span className="ml-1.5 text-green-600 dark:text-green-400 font-medium">
                            ✓ On track
                          </span>
                        )}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Target: {goal.targetCount} posts/{PERIOD_LABELS[goal.period].toLowerCase()}
                      </p>
                    )}

                    {/* Actions */}
                    <div className="flex gap-1.5 mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        disabled={togglingId === goal.id}
                        onClick={() => handleToggle(goal.id)}
                      >
                        {togglingId === goal.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : goal.isActive ? (
                          <>
                            <Pause className="mr-1 h-3 w-3" />
                            Pause
                          </>
                        ) : (
                          <>
                            <Play className="mr-1 h-3 w-3" />
                            Activate
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                        disabled={deletingId === goal.id}
                        onClick={() => handleDelete(goal.id)}
                      >
                        {deletingId === goal.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
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
