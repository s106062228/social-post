"use client";

import { useEffect, useState, useCallback } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LayoutGrid } from "lucide-react";
import type { ContentMixResponse, ContentMixCategory } from "@/app/api/analytics/content-mix/route";

type Period = "7d" | "30d" | "90d";

const PERIOD_LABELS: Record<Period, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

const CATEGORY_COLORS: Record<string, string> = {
  EDUCATIONAL: "#3b82f6",       // blue
  PROMOTIONAL: "#f97316",       // orange
  ENTERTAINING: "#a855f7",      // purple
  ENGAGING: "#22c55e",          // green
  INSPIRING: "#eab308",         // yellow
  NEWS: "#ef4444",              // red
  BEHIND_THE_SCENES: "#06b6d4", // cyan
  USER_GENERATED: "#ec4899",    // pink
  UNCATEGORIZED: "#94a3b8",     // gray
};

const CATEGORY_LABELS: Record<string, string> = {
  EDUCATIONAL: "Educational",
  PROMOTIONAL: "Promotional",
  ENTERTAINING: "Entertaining",
  ENGAGING: "Engaging",
  INSPIRING: "Inspiring",
  NEWS: "News",
  BEHIND_THE_SCENES: "Behind the Scenes",
  USER_GENERATED: "User Generated",
  UNCATEGORIZED: "Uncategorized",
};

function categoryLabel(key: string): string {
  return CATEGORY_LABELS[key] ?? key;
}

function categoryColor(key: string): string {
  return CATEGORY_COLORS[key] ?? "#94a3b8";
}

interface TableRowProps {
  item: ContentMixCategory;
}

function CategoryTableRow({ item }: TableRowProps) {
  const color = categoryColor(item.category);
  return (
    <tr className="border-b last:border-b-0 text-sm">
      <td className="py-2 pr-3">
        <span className="flex items-center gap-2">
          <span
            className="inline-block h-3 w-3 rounded-full shrink-0"
            style={{ backgroundColor: color }}
          />
          <span className="font-medium">{categoryLabel(item.category)}</span>
        </span>
      </td>
      <td className="py-2 pr-3 text-right tabular-nums">{item.count}</td>
      <td className="py-2 pr-3 text-right tabular-nums">{item.percentage}%</td>
      <td className="py-2 text-right tabular-nums text-muted-foreground">
        {item.avgEngagement}
      </td>
    </tr>
  );
}

export function ContentMixCard() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<ContentMixResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (p: Period) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/content-mix?period=${p}`);
      if (!res.ok) throw new Error("Failed to fetch content mix data");
      const json = (await res.json()) as ContentMixResponse;
      setData(json);
    } catch {
      setError("Failed to load content mix data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(period);
  }, [period, fetchData]);

  const pieData =
    data?.categories.map((c) => ({
      name: categoryLabel(c.category),
      value: c.count,
      color: categoryColor(c.category),
    })) ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-muted-foreground" />
            Content Mix
          </CardTitle>
          <CardDescription>
            Distribution of post categories ({PERIOD_LABELS[period]})
          </CardDescription>
        </div>
        <div className="flex gap-1 rounded-lg border bg-card p-1 shrink-0">
          {(["7d", "30d", "90d"] as Period[]).map((p) => (
            <Button
              key={p}
              variant={period === p ? "default" : "ghost"}
              size="sm"
              onClick={() => setPeriod(p)}
              className="h-7 px-2.5 text-xs"
            >
              {p}
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : error ? (
          <div className="flex h-52 items-center justify-center text-sm text-red-500">
            {error}
          </div>
        ) : !data || data.total === 0 ? (
          <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">
            No posts yet in this period
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Pie chart */}
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={({ name, percent }: { name: string; percent: number }) =>
                    percent > 0.05 ? `${Math.round(percent * 100)}%` : ""
                  }
                  labelLine={false}
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, name: string) => [value, name]}
                />
                <Legend
                  formatter={(value: string) => value}
                  iconSize={10}
                  iconType="circle"
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="pb-2 pr-3 text-left font-medium">Category</th>
                    <th className="pb-2 pr-3 text-right font-medium">Posts</th>
                    <th className="pb-2 pr-3 text-right font-medium">Share</th>
                    <th className="pb-2 text-right font-medium">Avg Engagement</th>
                  </tr>
                </thead>
                <tbody>
                  {data.categories.map((item) => (
                    <CategoryTableRow key={item.category} item={item} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
