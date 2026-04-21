"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Loader2, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const PLATFORM_OPTIONS = ["FACEBOOK", "INSTAGRAM", "THREADS"] as const;

const CRON_PRESETS = [
  { label: "Every day at 9am", value: "0 9 * * *" },
  { label: "Every Monday at 9am", value: "0 9 * * 1" },
  { label: "Every weekday at 9am", value: "0 9 * * 1-5" },
  { label: "Every hour", value: "0 * * * *" },
];

export function CreateScheduleForm() {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [cronExpr, setCronExpr] = useState("0 9 * * *");
  const [timezone, setTimezone] = useState("UTC");
  const [platforms, setPlatforms] = useState<string[]>(["FACEBOOK"]);

  function togglePlatform(platform: string) {
    setPlatforms((prev) =>
      prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform]
    );
  }

  function handleCancel() {
    setExpanded(false);
    setName("");
    setContent("");
    setCronExpr("0 9 * * *");
    setTimezone("UTC");
    setPlatforms(["FACEBOOK"]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (platforms.length === 0) {
      toast({ title: "Select at least one platform", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, content, cronExpr, timezone, platforms }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to create schedule");
      }
      toast({ title: "Recurring schedule created", variant: "success" });
      handleCancel();
      router.refresh();
    } catch (err) {
      toast({
        title: "Failed to create schedule",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  if (!expanded) {
    return (
      <Button size="sm" onClick={() => setExpanded(true)}>
        <Plus className="mr-2 h-4 w-4" />
        New Schedule
      </Button>
    );
  }

  return (
    <Card className="mt-6 w-full max-w-lg">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Create Recurring Schedule</CardTitle>
        <Button variant="ghost" size="sm" onClick={handleCancel} disabled={loading}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sched-name">Name</Label>
            <Input
              id="sched-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Daily Morning Post"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sched-content">Post content</Label>
            <textarea
              id="sched-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              placeholder="What would you like to post?"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Platforms</Label>
            <div className="flex gap-3">
              {PLATFORM_OPTIONS.map((p) => (
                <label key={p} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={platforms.includes(p)}
                    onChange={() => togglePlatform(p)}
                    className="h-4 w-4"
                  />
                  {p.charAt(0) + p.slice(1).toLowerCase()}
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sched-cron">Schedule (cron expression)</Label>
            <Input
              id="sched-cron"
              value={cronExpr}
              onChange={(e) => setCronExpr(e.target.value)}
              placeholder="0 9 * * *"
              required
              className="font-mono"
            />
            <div className="flex flex-wrap gap-1">
              {CRON_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setCronExpr(preset.value)}
                  className="rounded border px-2 py-0.5 text-xs hover:bg-accent"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sched-tz">Timezone</Label>
            <Input
              id="sched-tz"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="UTC"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleCancel} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
