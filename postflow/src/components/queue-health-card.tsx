"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { QueueHealthResponse } from "@/app/api/analytics/queue-health/route";
import type { QueueStatus } from "@/lib/queue-health";

function statusColor(status: QueueStatus): string {
  switch (status) {
    case "healthy": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    case "low": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
    case "critical": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    case "empty": return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
  }
}

function statusLabel(status: QueueStatus): string {
  switch (status) {
    case "healthy": return "Healthy";
    case "low": return "Low";
    case "critical": return "Critical";
    case "empty": return "Empty";
  }
}

export function QueueHealthCard() {
  const [data, setData] = useState<QueueHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/analytics/queue-health")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((d: QueueHealthResponse) => setData(d))
      .catch(() => setError("Failed to load queue health"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          Publishing Queue Health
          {data && (
            <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${statusColor(data.queueStatus)}`}>
              {statusLabel(data.queueStatus)}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="space-y-3 animate-pulse">
            <div className="h-4 bg-muted rounded w-1/2" />
            <div className="h-4 bg-muted rounded w-2/3" />
            <div className="h-4 bg-muted rounded w-1/3" />
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {data && (
          <div className="space-y-4">
            {/* KPI row */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-muted/40 rounded p-3">
                <p className="text-2xl font-bold">{data.scheduledCount}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Scheduled Posts</p>
              </div>
              <div className="bg-muted/40 rounded p-3">
                <p className="text-2xl font-bold">{data.avgPostsPerDay}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Avg Posts/Day</p>
              </div>
              <div className="bg-muted/40 rounded p-3">
                <p className="text-2xl font-bold">
                  {data.queueRunwayDays === 0 ? "—" : `${data.queueRunwayDays}d`}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Runway</p>
              </div>
            </div>

            {/* Next post */}
            {data.nextScheduledAt && (
              <p className="text-sm text-muted-foreground">
                Next post:{" "}
                <span className="font-medium text-foreground">
                  {new Date(data.nextScheduledAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </p>
            )}

            {/* Platform breakdown */}
            {data.platformBreakdown.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Platform breakdown</p>
                <div className="flex flex-wrap gap-2">
                  {data.platformBreakdown.map(({ platform, count }) => (
                    <Badge key={platform} variant="secondary" className="text-xs">
                      {platform} · {count}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Content gaps */}
            {data.contentGapDays.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">
                  Content gaps next 14 days ({data.contentGapDays.length} day{data.contentGapDays.length !== 1 ? "s" : ""} unscheduled)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {data.contentGapDays.slice(0, 7).map(({ date, dayOfWeek }) => (
                    <span
                      key={date}
                      className="text-xs bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300 px-2 py-0.5 rounded"
                    >
                      {dayOfWeek.slice(0, 3)} {date.slice(5)}
                    </span>
                  ))}
                  {data.contentGapDays.length > 7 && (
                    <span className="text-xs text-muted-foreground px-1">
                      +{data.contentGapDays.length - 7} more
                    </span>
                  )}
                </div>
              </div>
            )}

            {data.scheduledCount === 0 && (
              <p className="text-sm text-muted-foreground text-center py-2">
                No scheduled posts — your queue is empty.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
