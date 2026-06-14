"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FlaskConical, TrendingUp, AlertCircle } from "lucide-react";

interface ABStatResult {
  rateA: number;
  rateB: number;
  engagementA: number;
  engagementB: number;
  impressionsA: number;
  impressionsB: number;
  zScore: number;
  pValue: number;
  confidenceLevel: number;
  isSignificant: boolean;
  winnerLead: "A" | "B" | "INCONCLUSIVE";
  effect: number;
  hasSufficientData: boolean;
}

interface StatsResponse {
  testId: string;
  name: string;
  winner: string | null;
  createdAt: string;
  stats: ABStatResult;
}

export function ABTestStatisticsPanel({ testId }: { testId: string }) {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/ab-tests/${testId}/stats`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [testId]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="h-4 w-4" />
            Statistical Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground animate-pulse">Loading statistics…</p>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="h-4 w-4" />
            Statistical Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            {error ?? "Failed to load statistics"}
          </div>
        </CardContent>
      </Card>
    );
  }

  const { stats } = data;

  function confidenceBadgeVariant(level: number) {
    if (level >= 99) return "default";
    if (level >= 95) return "secondary";
    return "outline";
  }

  function winnerLabel() {
    if (!stats.hasSufficientData) return "Insufficient data (need ≥100 impressions per variant)";
    if (!stats.isSignificant) return "Not statistically significant yet";
    if (stats.winnerLead === "INCONCLUSIVE") return "Inconclusive — rates are equal";
    return `Variant ${stats.winnerLead} is leading`;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4" />
          Statistical Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Status */}
        <div className="flex items-center gap-2 flex-wrap">
          {stats.isSignificant ? (
            <Badge variant={stats.winnerLead !== "INCONCLUSIVE" ? "default" : "outline"}>
              {winnerLabel()}
            </Badge>
          ) : (
            <Badge variant="outline">{winnerLabel()}</Badge>
          )}
          {stats.confidenceLevel > 0 && (
            <Badge variant={confidenceBadgeVariant(stats.confidenceLevel)}>
              {stats.confidenceLevel}% confidence
            </Badge>
          )}
        </div>

        {/* Metrics table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 text-left font-medium text-muted-foreground">Metric</th>
                <th className="py-2 text-right font-medium">Variant A</th>
                <th className="py-2 text-right font-medium">Variant B</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2 text-muted-foreground">Impressions</td>
                <td className="py-2 text-right">{stats.impressionsA.toLocaleString()}</td>
                <td className="py-2 text-right">{stats.impressionsB.toLocaleString()}</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 text-muted-foreground">Total engagements</td>
                <td className="py-2 text-right">{stats.engagementA.toLocaleString()}</td>
                <td className="py-2 text-right">{stats.engagementB.toLocaleString()}</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 text-muted-foreground">Engagement rate</td>
                <td
                  className={`py-2 text-right font-medium ${
                    stats.winnerLead === "A" && stats.isSignificant
                      ? "text-green-600 dark:text-green-400"
                      : ""
                  }`}
                >
                  {(stats.rateA * 100).toFixed(2)}%
                </td>
                <td
                  className={`py-2 text-right font-medium ${
                    stats.winnerLead === "B" && stats.isSignificant
                      ? "text-green-600 dark:text-green-400"
                      : ""
                  }`}
                >
                  {(stats.rateB * 100).toFixed(2)}%
                </td>
              </tr>
              <tr className="border-b last:border-0">
                <td className="py-2 text-muted-foreground">Effect size</td>
                <td className="py-2 text-right text-muted-foreground" colSpan={2}>
                  {stats.effect > 0 ? `${stats.effect.toFixed(1)}% relative difference` : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Z-score and p-value */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatBox label="Z-score" value={stats.zScore.toFixed(3)} />
          <StatBox label="p-value" value={stats.pValue.toFixed(4)} />
          <StatBox
            label="Min. impressions"
            value={stats.hasSufficientData ? "✓ met" : "✗ not met"}
            muted={!stats.hasSufficientData}
          />
        </div>

        {!stats.hasSufficientData && (
          <p className="text-xs text-muted-foreground">
            At least 100 impressions per variant are required for a reliable statistical test.
            Sync insights from each post to get updated data.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StatBox({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-md border bg-muted px-3 py-2 text-center">
      <p className={`text-base font-semibold ${muted ? "text-muted-foreground" : ""}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
