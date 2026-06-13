"use client";

import { useState, useEffect, useCallback } from "react";
import {
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type Period = "7d" | "30d" | "90d";

interface ReputationData {
  period: string;
  reputationScore: number;
  trend: "improving" | "stable" | "declining";
  distribution: { positive: number; neutral: number; negative: number; total: number };
  dailyBreakdown: { date: string; positive: number; neutral: number; negative: number }[];
  analyzedCount: number;
  totalCount: number;
}

function TrendBadge({ trend }: { trend: "improving" | "stable" | "declining" }) {
  if (trend === "improving") return <span className="text-green-600 font-medium">↑ Improving</span>;
  if (trend === "declining") return <span className="text-red-600 font-medium">↓ Declining</span>;
  return <span className="text-gray-500 font-medium">→ Stable</span>;
}

function scoreColor(score: number): string {
  if (score >= 70) return "text-green-600";
  if (score >= 40) return "text-yellow-600";
  return "text-red-600";
}

const PIE_COLORS = ["#16a34a", "#6b7280", "#dc2626"];

export function ReputationScoreCard() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<ReputationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/reputation?period=${period}`);
      if (!res.ok) throw new Error("Failed to fetch");
      setData(await res.json());
    } catch {
      setError("Failed to load reputation data");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const res = await fetch("/api/inbox/comments/analyze", { method: "POST" });
      if (res.ok) await fetchData();
    } catch {
      // ignore
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="bg-card rounded-lg border p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Brand Reputation Score</h2>
          <p className="text-sm text-muted-foreground">Based on comment sentiment from your inbox</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
            className="text-sm border rounded px-2 py-1 bg-background"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            className="text-sm px-3 py-1 rounded border border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
          >
            {analyzing ? "Analyzing…" : "Analyze Comments"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="h-48 flex items-center justify-center text-muted-foreground">Loading…</div>
      ) : error ? (
        <div className="h-48 flex items-center justify-center text-red-500">{error}</div>
      ) : !data || data.analyzedCount === 0 ? (
        <div className="h-48 flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <p>No sentiment data yet.</p>
          <p className="text-sm">Sync comments from the Inbox, then click "Analyze Comments".</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Score + Trend + Distribution */}
          <div className="flex flex-wrap gap-6 items-center">
            {/* Score gauge */}
            <div className="flex flex-col items-center">
              <span className={`text-5xl font-bold tabular-nums ${scoreColor(data.reputationScore)}`}>
                {data.reputationScore}
              </span>
              <span className="text-sm text-muted-foreground mt-1">/ 100</span>
              <TrendBadge trend={data.trend} />
            </div>

            {/* Donut */}
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={120} height={120}>
                <PieChart>
                  <Pie
                    data={[
                      { name: "Positive", value: data.distribution.positive },
                      { name: "Neutral", value: data.distribution.neutral },
                      { name: "Negative", value: data.distribution.negative },
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={35}
                    outerRadius={55}
                    dataKey="value"
                    startAngle={90}
                    endAngle={-270}
                  >
                    {PIE_COLORS.map((color, i) => (
                      <Cell key={i} fill={color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="text-sm space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-green-600 inline-block" />
                  <span>Positive: {data.distribution.positive}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-gray-500 inline-block" />
                  <span>Neutral: {data.distribution.neutral}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-red-600 inline-block" />
                  <span>Negative: {data.distribution.negative}</span>
                </div>
                <div className="text-muted-foreground text-xs pt-1">
                  {data.analyzedCount}/{data.totalCount} analyzed
                </div>
              </div>
            </div>
          </div>

          {/* Daily sparkline */}
          {data.dailyBreakdown.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2 text-muted-foreground">Daily sentiment (last 30 days)</p>
              <ResponsiveContainer width="100%" height={80}>
                <AreaChart data={data.dailyBreakdown} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey="date" hide />
                  <YAxis hide />
                  <Tooltip
                    formatter={(val, name) => [val, name]}
                    labelFormatter={(label) => label}
                  />
                  <Area
                    type="monotone"
                    dataKey="positive"
                    stackId="1"
                    stroke="#16a34a"
                    fill="#bbf7d0"
                    name="Positive"
                  />
                  <Area
                    type="monotone"
                    dataKey="neutral"
                    stackId="1"
                    stroke="#6b7280"
                    fill="#e5e7eb"
                    name="Neutral"
                  />
                  <Area
                    type="monotone"
                    dataKey="negative"
                    stackId="1"
                    stroke="#dc2626"
                    fill="#fecaca"
                    name="Negative"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
