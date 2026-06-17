"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Workflow } from "lucide-react";
import type { WorkflowEfficiencyResponse } from "@/app/api/analytics/workflow-efficiency/route";

type Period = "30d" | "90d";

const PERIOD_LABELS: Record<Period, string> = {
  "30d": "30 days",
  "90d": "90 days",
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-400",
  SCHEDULED: "bg-blue-400",
  PUBLISHING: "bg-yellow-400",
  PUBLISHED: "bg-green-500",
  PARTIALLY_PUBLISHED: "bg-orange-400",
  FAILED: "bg-red-500",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  PUBLISHING: "Publishing",
  PUBLISHED: "Published",
  PARTIALLY_PUBLISHED: "Partial",
  FAILED: "Failed",
};

function HoursStat({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: number | null;
  colorClass: string;
}) {
  return (
    <div className={`rounded-lg p-3 text-center ${colorClass}`}>
      <p className="text-xl font-bold text-white">
        {value !== null ? `${value}h` : "—"}
      </p>
      <p className="text-xs text-white/80 mt-0.5">{label}</p>
    </div>
  );
}

function StatusBar({
  data,
}: {
  data: WorkflowEfficiencyResponse["statusDistribution"];
}) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">Status Distribution</p>
      <div className="space-y-1">
        {data.map((entry) => {
          const pct = Math.round((entry.count / total) * 100);
          const color = STATUS_COLORS[entry.status] ?? "bg-muted-foreground";
          const label = STATUS_LABELS[entry.status] ?? entry.status;
          return (
            <div key={entry.status} className="flex items-center gap-2 text-xs">
              <span className="w-24 shrink-0 font-medium truncate">{label}</span>
              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full ${color}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-8 text-right text-muted-foreground">
                {entry.count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function WorkflowEfficiencyCard() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<WorkflowEfficiencyResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (p: Period) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/analytics/workflow-efficiency?period=${p}`
      );
      if (res.ok) {
        const json = (await res.json()) as WorkflowEfficiencyResponse;
        setData(json);
      }
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(period);
  }, [fetchData, period]);

  const hasData = data && data.postsPublished > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Workflow className="h-5 w-5 text-violet-500" />
            <CardTitle className="text-base">Workflow Efficiency</CardTitle>
          </div>
          <div className="flex gap-1">
            {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
              <Button
                key={p}
                variant={period === p ? "default" : "ghost"}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setPeriod(p)}
              >
                {PERIOD_LABELS[p]}
              </Button>
            ))}
          </div>
        </div>
        <CardDescription>
          Time-to-publish tracking across draft, scheduled, and published stages
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-0">
        {loading ? (
          <div className="space-y-4 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-4 bg-muted rounded w-1/3" />
                <div className="h-10 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : !hasData ? (
          <div className="text-center py-8 space-y-2">
            <Workflow className="h-10 w-10 mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No published posts yet.
            </p>
            <p className="text-xs text-muted-foreground">
              Publish posts to see your workflow timing analytics.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Funnel stats */}
            <div className="grid grid-cols-3 gap-2">
              <HoursStat
                label="Draft → Scheduled"
                value={data.avgDraftToScheduledHours}
                colorClass="bg-blue-500"
              />
              <HoursStat
                label="Scheduled → Published"
                value={data.avgScheduledToPublishedHours}
                colorClass="bg-green-600"
              />
              <HoursStat
                label="Draft → Published"
                value={data.avgDraftToPublishedHours}
                colorClass="bg-violet-500"
              />
            </div>

            {/* Fastest / slowest */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-xl font-bold text-green-600">
                  {data.fastestPublishHours !== null
                    ? `${data.fastestPublishHours}h`
                    : "—"}
                </p>
                <p className="text-xs text-muted-foreground">Fastest Publish</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-xl font-bold text-orange-500">
                  {data.slowestPublishHours !== null
                    ? `${data.slowestPublishHours}h`
                    : "—"}
                </p>
                <p className="text-xs text-muted-foreground">Slowest Publish</p>
              </div>
            </div>

            {/* Status distribution */}
            <StatusBar data={data.statusDistribution} />

            {/* Counts */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>
                <span className="font-medium text-foreground">
                  {data.postsPublished}
                </span>{" "}
                published
              </span>
              <span>
                <span className="font-medium text-foreground">
                  {data.postsStillDraft}
                </span>{" "}
                still in draft
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
