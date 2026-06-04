"use client";

import { useState, useEffect, useCallback } from "react";
import { Milestone, Trophy, TrendingUp, Star } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatMilestone, MILESTONE_THRESHOLDS } from "@/lib/follower-milestones";

interface MilestoneItem {
  id: string;
  platform: string;
  milestone: number;
  achievedAt: string;
  celebrated: boolean;
  accountId: string;
  accountName: string;
}

interface GrowthProjection {
  accountId: string;
  accountName: string;
  platform: string;
  currentFollowers: number;
  growthRatePerDay: number;
  projections: { days: number; projected: number }[];
  nextMilestone: number | null;
  daysToNextMilestone: number | null;
}

export default function MilestonesPage() {
  const [milestones, setMilestones] = useState<MilestoneItem[]>([]);
  const [projections, setProjections] = useState<GrowthProjection[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [msRes, projRes] = await Promise.all([
        fetch("/api/milestones"),
        fetch("/api/analytics/growth-projection"),
      ]);
      if (msRes.ok) {
        const data = await msRes.json();
        setMilestones(data.milestones ?? []);
      }
      if (projRes.ok) {
        const data = await projRes.json();
        setProjections(data.accounts ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const celebrate = async (id: string) => {
    const res = await fetch(`/api/milestones/${id}/celebrate`, { method: "POST" });
    if (res.ok) {
      setMilestones((prev) =>
        prev.map((m) => (m.id === id ? { ...m, celebrated: true } : m))
      );
      toast({ title: "Milestone celebrated! 🎉" });
    }
  };

  const uncelebrated = milestones.filter((m) => !m.celebrated);
  const celebrated = milestones.filter((m) => m.celebrated);

  return (
    <div className="flex flex-col gap-8 p-8">
      <div className="flex items-center gap-3">
        <Milestone className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Milestones</h1>
          <p className="text-muted-foreground">
            Follower milestones and growth projections across your social accounts.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : (
        <>
          {/* New milestones */}
          {uncelebrated.length > 0 && (
            <section>
              <h2 className="mb-4 text-lg font-semibold flex items-center gap-2">
                <Star className="h-5 w-5 text-yellow-500" />
                New Milestones to Celebrate
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {uncelebrated.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-lg border-2 border-yellow-400 bg-yellow-50 dark:bg-yellow-950/20 p-5 flex flex-col gap-3"
                  >
                    <div className="flex items-center gap-2">
                      <Trophy className="h-6 w-6 text-yellow-500" />
                      <span className="text-2xl font-bold">
                        {formatMilestone(m.milestone)} followers
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {m.accountName} · {m.platform}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Achieved {new Date(m.achievedAt).toLocaleDateString()}
                    </p>
                    <button
                      onClick={() => celebrate(m.id)}
                      className="mt-auto rounded-md bg-yellow-500 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-600 transition-colors"
                    >
                      🎉 Celebrate!
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Growth projections */}
          {projections.length > 0 && (
            <section>
              <h2 className="mb-4 text-lg font-semibold flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Growth Projections
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {projections.map((proj) => (
                  <div key={proj.accountId} className="rounded-lg border p-5 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold">{proj.accountName}</p>
                        <p className="text-xs text-muted-foreground">{proj.platform}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold">
                          {proj.currentFollowers.toLocaleString()}
                        </p>
                        <p className="text-xs text-muted-foreground">current followers</p>
                      </div>
                    </div>

                    <div className="text-sm text-muted-foreground">
                      Growth rate:{" "}
                      <span className="font-medium text-foreground">
                        {proj.growthRatePerDay > 0
                          ? `+${proj.growthRatePerDay.toFixed(1)}/day`
                          : "No data yet"}
                      </span>
                    </div>

                    {proj.nextMilestone && (
                      <div className="rounded-md bg-muted px-3 py-2 text-sm">
                        <span className="font-medium">Next milestone: </span>
                        {formatMilestone(proj.nextMilestone)}
                        {proj.daysToNextMilestone !== null && (
                          <span className="ml-1 text-muted-foreground">
                            (~{proj.daysToNextMilestone} days)
                          </span>
                        )}
                      </div>
                    )}

                    {proj.projections.length > 0 && proj.growthRatePerDay > 0 && (
                      <div className="grid grid-cols-3 gap-2">
                        {proj.projections.map((p) => (
                          <div key={p.days} className="rounded-md border p-2 text-center">
                            <p className="text-xs text-muted-foreground">+{p.days}d</p>
                            <p className="font-semibold">{p.projected.toLocaleString()}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* All milestone thresholds */}
          <section>
            <h2 className="mb-4 text-lg font-semibold">Milestone Thresholds</h2>
            <div className="flex flex-wrap gap-2">
              {MILESTONE_THRESHOLDS.map((t) => {
                const achieved = milestones.some((m) => m.milestone === t);
                return (
                  <span
                    key={t}
                    className={`rounded-full px-3 py-1 text-sm font-medium ${
                      achieved
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {formatMilestone(t)}
                  </span>
                );
              })}
            </div>
          </section>

          {/* Milestone history */}
          {celebrated.length > 0 && (
            <section>
              <h2 className="mb-4 text-lg font-semibold">Milestone History</h2>
              <div className="rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-3 text-left font-medium">Milestone</th>
                      <th className="px-4 py-3 text-left font-medium">Account</th>
                      <th className="px-4 py-3 text-left font-medium">Platform</th>
                      <th className="px-4 py-3 text-left font-medium">Achieved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {celebrated.map((m) => (
                      <tr key={m.id} className="border-b last:border-0">
                        <td className="px-4 py-3 font-semibold">
                          {formatMilestone(m.milestone)}
                        </td>
                        <td className="px-4 py-3">{m.accountName}</td>
                        <td className="px-4 py-3 text-muted-foreground">{m.platform}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {new Date(m.achievedAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {milestones.length === 0 && projections.length === 0 && (
            <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
              <Milestone className="mx-auto mb-3 h-10 w-10 opacity-40" />
              <p className="text-lg font-medium">No milestones yet</p>
              <p className="text-sm mt-1">
                Connect social accounts and grow your audience to unlock milestones.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
