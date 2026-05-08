"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertMetric, AlertOperator, Platform } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const METRIC_LABELS: Record<AlertMetric, string> = {
  IMPRESSIONS: "Impressions",
  REACH: "Reach",
  LIKES: "Likes",
  COMMENTS: "Comments",
  SHARES: "Shares",
  SCORE: "Engagement Score",
};

const OPERATOR_LABELS: Record<AlertOperator, string> = {
  ABOVE: "rises above",
  BELOW: "drops below",
};

const PLATFORM_LABELS: Record<Platform, string> = {
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  THREADS: "Threads",
  LINKEDIN: "LinkedIn",
  PINTEREST: "Pinterest",
  YOUTUBE: "YouTube",
  TIKTOK: "TikTok",
  TWITTER: "X (Twitter)",
  BLUESKY: "Bluesky",
  MASTODON: "Mastodon",
  TELEGRAM: "Telegram",
  REDDIT: "Reddit",
  NOSTR: "Nostr",
  TUMBLR: "Tumblr",
  WORDPRESS: "WordPress",
  MEDIUM: "Medium",
  GHOST: "Ghost",
};

export function CreatePerformanceAlertForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [metric, setMetric] = useState<AlertMetric>(AlertMetric.LIKES);
  const [operator, setOperator] = useState<AlertOperator>(AlertOperator.BELOW);
  const [threshold, setThreshold] = useState("");
  const [platform, setPlatform] = useState<Platform | "">("");
  const [period, setPeriod] = useState<"7d" | "30d">("7d");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: "Alert name is required", variant: "destructive" });
      return;
    }
    const thresholdNum = parseFloat(threshold);
    if (isNaN(thresholdNum) || thresholdNum < 0) {
      toast({ title: "Threshold must be a non-negative number", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/performance-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          metric,
          operator,
          threshold: thresholdNum,
          platform: platform || undefined,
          period,
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to create alert");
      }

      toast({ title: "Performance alert created", variant: "success" });
      setName("");
      setThreshold("");
      setPlatform("");
      router.refresh();
    } catch (err) {
      toast({
        title: "Failed to create alert",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="alertName">Alert name</Label>
        <Input
          id="alertName"
          placeholder="e.g. Low engagement warning"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="metric">Metric</Label>
          <select
            id="metric"
            value={metric}
            onChange={(e) => setMetric(e.target.value as AlertMetric)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            {Object.values(AlertMetric).map((m) => (
              <option key={m} value={m}>{METRIC_LABELS[m]}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="operator">Condition</Label>
          <select
            id="operator"
            value={operator}
            onChange={(e) => setOperator(e.target.value as AlertOperator)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            {Object.values(AlertOperator).map((op) => (
              <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="threshold">Threshold</Label>
        <Input
          id="threshold"
          type="number"
          min="0"
          step="any"
          placeholder="e.g. 100"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="platform">Platform (optional)</Label>
          <select
            id="platform"
            value={platform}
            onChange={(e) => setPlatform(e.target.value as Platform | "")}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <option value="">All platforms</option>
            {Object.values(Platform).map((p) => (
              <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="period">Period</Label>
          <select
            id="period"
            value={period}
            onChange={(e) => setPeriod(e.target.value as "7d" | "30d")}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
        </div>
      </div>

      <Button type="submit" disabled={loading} className="self-start">
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Create alert
      </Button>
    </form>
  );
}
