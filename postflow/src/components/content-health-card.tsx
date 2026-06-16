"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Lightbulb,
} from "lucide-react";
import type { ContentHealthResponse } from "@/app/api/analytics/content-health/route";

type Period = "30d" | "90d";

function ScoreRing({ score }: { score: number }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);

  const color =
    score >= 85
      ? "#22c55e" // green
      : score >= 65
      ? "#3b82f6" // blue
      : score >= 40
      ? "#f59e0b" // amber
      : "#ef4444"; // red

  return (
    <svg width={100} height={100} viewBox="0 0 100 100">
      {/* Track */}
      <circle cx={50} cy={50} r={r} fill="none" stroke="#e5e7eb" strokeWidth={10} />
      {/* Progress */}
      <circle
        cx={50}
        cy={50}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={10}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 50 50)"
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
      {/* Score label */}
      <text
        x={50}
        y={47}
        textAnchor="middle"
        fill={color}
        fontSize={22}
        fontWeight="bold"
      >
        {score}
      </text>
      <text x={50} y={62} textAnchor="middle" fill="#6b7280" fontSize={11}>
        /100
      </text>
    </svg>
  );
}

function DimensionRow({
  name,
  score,
  max,
  label,
  detail,
}: {
  name: string;
  score: number;
  max: number;
  label: string;
  detail: string;
}) {
  const pct = max > 0 ? (score / max) * 100 : 0;
  const barColor =
    pct >= 85
      ? "bg-green-500"
      : pct >= 65
      ? "bg-blue-500"
      : pct >= 40
      ? "bg-amber-500"
      : "bg-red-500";

  const labelColor =
    label === "Excellent"
      ? "text-green-600 bg-green-50"
      : label === "Good"
      ? "text-blue-600 bg-blue-50"
      : label === "Fair"
      ? "text-amber-600 bg-amber-50"
      : "text-red-600 bg-red-50";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{name}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${labelColor}`}>
          {label}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-100">
        <div
          className={`h-2 rounded-full ${barColor} transition-all duration-500`}
          style={{ width: `${Math.round(pct)}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function labelIcon(label: string) {
  if (label === "Excellent") return <CheckCircle2 className="h-5 w-5 text-green-500" />;
  if (label === "Good") return <CheckCircle2 className="h-5 w-5 text-blue-500" />;
  if (label === "Fair") return <AlertCircle className="h-5 w-5 text-amber-500" />;
  return <XCircle className="h-5 w-5 text-red-500" />;
}

export function ContentHealthCard() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<ContentHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (p: Period) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/content-health?period=${p}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json = (await res.json()) as ContentHealthResponse;
      setData(json);
    } catch {
      setError("Could not load content health data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(period);
  }, [fetchData, period]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-indigo-500" />
            <CardTitle>Content Health</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {(["30d", "90d"] as const).map((p) => (
              <Button
                key={p}
                variant={period === p ? "default" : "outline"}
                size="sm"
                onClick={() => setPeriod(p)}
              >
                {p === "30d" ? "30 days" : "90 days"}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void fetchData(period)}
              disabled={loading}
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
        <CardDescription>
          Holistic score across diversity, coverage, regularity, engagement trend, and freshness
        </CardDescription>
      </CardHeader>

      <CardContent>
        {loading && (
          <div className="flex flex-col gap-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-gray-100 animate-pulse" />
            ))}
          </div>
        )}

        {error && !loading && (
          <p className="text-sm text-destructive text-center py-6">{error}</p>
        )}

        {data && !loading && (
          <div className="flex flex-col gap-6">
            {/* Overall score */}
            <div className="flex items-center gap-6">
              <ScoreRing score={data.overallScore} />
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  {labelIcon(data.overallLabel)}
                  <span className="text-lg font-bold">{data.overallLabel}</span>
                </div>
                <Badge variant="outline" className="w-fit">
                  {data.period} period
                </Badge>
                <p className="text-xs text-muted-foreground mt-1">
                  Overall content health score
                </p>
              </div>
            </div>

            {/* Dimension breakdown */}
            <div className="flex flex-col gap-4">
              {data.dimensions.map((dim) => (
                <DimensionRow key={dim.name} {...dim} />
              ))}
            </div>

            {/* Recommendations */}
            {data.recommendations.length > 0 && (
              <div className="rounded-lg bg-indigo-50 dark:bg-indigo-950/30 p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-indigo-500 shrink-0" />
                  <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
                    Recommendations
                  </span>
                </div>
                <ul className="flex flex-col gap-1.5 pl-1">
                  {data.recommendations.map((rec, i) => (
                    <li key={i} className="text-xs text-indigo-600 dark:text-indigo-400">
                      • {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
