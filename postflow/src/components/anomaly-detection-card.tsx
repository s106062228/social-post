"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, AlertTriangle, RefreshCw } from "lucide-react";
import type { AnomaliesResponse } from "@/app/api/analytics/anomalies/route";
import type { PostAnomaly } from "@/lib/anomaly-detection";

type Period = "7d" | "30d" | "90d" | "all";

function PeriodButton({
  label,
  value,
  current,
  onChange,
}: {
  label: string;
  value: Period;
  current: Period;
  onChange: (v: Period) => void;
}) {
  return (
    <button
      onClick={() => onChange(value)}
      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
        current === value
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:bg-accent"
      }`}
    >
      {label}
    </button>
  );
}

function AnomalyBadge({ type }: { type: PostAnomaly["anomalyType"] }) {
  if (type === "spike") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
        <TrendingUp className="w-3 h-3" />
        Spike
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
      <TrendingDown className="w-3 h-3" />
      Drop
    </span>
  );
}

function ZScoreBadge({ z }: { z: number }) {
  const abs = Math.abs(z).toFixed(1);
  const color =
    Math.abs(z) >= 3
      ? "text-orange-600 dark:text-orange-400"
      : "text-muted-foreground";
  return <span className={`text-xs font-mono ${color}`}>z={abs}</span>;
}

export function AnomalyDetectionCard() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<AnomaliesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/anomalies?period=${period}`);
      if (!res.ok) throw new Error("Failed to fetch anomalies");
      const json = (await res.json()) as AnomaliesResponse;
      setData(json);
    } catch {
      setError("Could not load anomaly data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const spikes = data?.anomalies.filter((a) => a.anomalyType === "spike") ?? [];
  const drops = data?.anomalies.filter((a) => a.anomalyType === "drop") ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <CardTitle className="text-base">Performance Anomaly Detection</CardTitle>
        </div>
        <div className="flex items-center gap-1.5">
          {(["7d", "30d", "90d", "all"] as Period[]).map((p) => (
            <PeriodButton key={p} label={p} value={p} current={period} onChange={setPeriod} />
          ))}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 ml-1"
            onClick={() => void fetchData()}
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 rounded bg-muted" />
            ))}
          </div>
        )}

        {!loading && error && (
          <p className="text-sm text-destructive text-center py-6">{error}</p>
        )}

        {!loading && !error && data && data.anomalies.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium">No anomalies detected</p>
            <p className="text-xs mt-1">
              {data.totalAnalyzed < 3
                ? "Need at least 3 published posts per platform to compute a baseline."
                : `All ${data.totalAnalyzed} analysed posts are within normal engagement range.`}
            </p>
          </div>
        )}

        {!loading && !error && data && data.anomalies.length > 0 && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">
                {data.totalAnalyzed} posts analysed
              </span>
              {spikes.length > 0 && (
                <span className="flex items-center gap-1 text-green-600 dark:text-green-400 font-medium">
                  <TrendingUp className="w-3.5 h-3.5" />
                  {spikes.length} spike{spikes.length !== 1 ? "s" : ""}
                </span>
              )}
              {drops.length > 0 && (
                <span className="flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
                  <TrendingDown className="w-3.5 h-3.5" />
                  {drops.length} drop{drops.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            {/* Anomaly list */}
            <div className="space-y-2">
              {data.anomalies.slice(0, 10).map((anomaly, idx) => (
                <AnomalyRow key={`${anomaly.postId}-${anomaly.platform}-${idx}`} anomaly={anomaly} />
              ))}
              {data.anomalies.length > 10 && (
                <p className="text-xs text-muted-foreground text-center pt-1">
                  + {data.anomalies.length - 10} more anomalies
                </p>
              )}
            </div>

            {/* Platform baselines */}
            {data.platformBaselines.length > 0 && (
              <details className="group">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors select-none">
                  Platform baselines ({data.platformBaselines.length})
                </summary>
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {data.platformBaselines.map((b) => (
                    <div
                      key={b.platform}
                      className="rounded-md border p-2 text-xs space-y-0.5"
                    >
                      <div className="font-medium capitalize">{b.platform}</div>
                      <div className="text-muted-foreground">
                        μ={b.mean.toFixed(0)} σ={b.stddev.toFixed(0)}
                      </div>
                      <div className="text-muted-foreground">n={b.sampleSize}</div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AnomalyRow({ anomaly }: { anomaly: PostAnomaly }) {
  const preview =
    anomaly.content.length > 80
      ? anomaly.content.slice(0, 80) + "…"
      : anomaly.content;

  const publishedDate = anomaly.publishedAt
    ? new Date(anomaly.publishedAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <div className="flex items-start gap-3 rounded-lg border p-3 text-sm">
      <div className="mt-0.5 flex-shrink-0">
        {anomaly.anomalyType === "spike" ? (
          <TrendingUp className="w-4 h-4 text-green-500" />
        ) : (
          <TrendingDown className="w-4 h-4 text-red-500" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <AnomalyBadge type={anomaly.anomalyType} />
          <span className="text-xs text-muted-foreground capitalize">{anomaly.platform}</span>
          {publishedDate && (
            <span className="text-xs text-muted-foreground">{publishedDate}</span>
          )}
          <ZScoreBadge z={anomaly.zScore} />
        </div>
        <p className="text-xs text-muted-foreground leading-snug truncate">{preview}</p>
        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
          <span>Score: {anomaly.engagementScore.toFixed(0)}</span>
          <span>Baseline: {anomaly.mean.toFixed(0)} ± {anomaly.stddev.toFixed(0)}</span>
        </div>
      </div>
    </div>
  );
}
