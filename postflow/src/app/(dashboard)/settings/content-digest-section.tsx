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
import { Label } from "@/components/ui/label";
import { Mail } from "lucide-react";
import { toast } from "sonner";

const DAY_OPTIONS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const hour12 = i === 0 ? 12 : i > 12 ? i - 12 : i;
  const ampm = i < 12 ? "AM" : "PM";
  return { value: i, label: `${String(hour12).padStart(2, "0")}:00 ${ampm} UTC` };
});

const LOOK_AHEAD_OPTIONS = [
  { value: 3, label: "3 days" },
  { value: 5, label: "5 days" },
  { value: 7, label: "7 days (1 week)" },
  { value: 14, label: "14 days (2 weeks)" },
];

interface DigestConfig {
  enabled: boolean;
  dayOfWeek: number;
  hourUTC: number;
  lookAheadDays: number;
  includeContent: boolean;
}

const DEFAULT_CONFIG: DigestConfig = {
  enabled: false,
  dayOfWeek: 1,
  hourUTC: 9,
  lookAheadDays: 7,
  includeContent: true,
};

export function ContentDigestSection() {
  const [config, setConfig] = useState<DigestConfig>(DEFAULT_CONFIG);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/content-digest");
      if (res.ok) {
        const data = (await res.json()) as DigestConfig;
        setConfig(data);
      }
    } catch {
      // silently fail — defaults are fine
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  async function handleSave() {
    setIsSaving(true);
    try {
      const res = await fetch("/api/settings/content-digest", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to save");
      }

      const updated = (await res.json()) as DigestConfig;
      setConfig(updated);
      toast.success("Content digest settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Content Preview Digest
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Content Preview Digest
        </CardTitle>
        <CardDescription>
          Receive a weekly email preview of your upcoming scheduled posts, so you can review
          your content plan at a glance.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {/* Enable toggle */}
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="digest-enabled" className="font-medium">
              Enable digest emails
            </Label>
            <p className="text-sm text-muted-foreground mt-0.5">
              Send a scheduled preview of upcoming posts
            </p>
          </div>
          <button
            id="digest-enabled"
            role="switch"
            aria-checked={config.enabled}
            onClick={() => setConfig((c) => ({ ...c, enabled: !c.enabled }))}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
              config.enabled ? "bg-primary" : "bg-input"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out ${
                config.enabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {config.enabled && (
          <>
            {/* Day of week */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="digest-day">Send on</Label>
              <select
                id="digest-day"
                value={config.dayOfWeek}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, dayOfWeek: Number(e.target.value) }))
                }
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {DAY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Hour (UTC) */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="digest-hour">Send at (UTC)</Label>
              <select
                id="digest-hour"
                value={config.hourUTC}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, hourUTC: Number(e.target.value) }))
                }
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {HOUR_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Look-ahead days */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="digest-lookahead">Preview window</Label>
              <select
                id="digest-lookahead"
                value={config.lookAheadDays}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, lookAheadDays: Number(e.target.value) }))
                }
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {LOOK_AHEAD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                How many days ahead to show in your digest
              </p>
            </div>

            {/* Include content */}
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="digest-content" className="font-medium">
                  Include post content preview
                </Label>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Show the first 200 characters of each post in the email
                </p>
              </div>
              <button
                id="digest-content"
                role="switch"
                aria-checked={config.includeContent}
                onClick={() =>
                  setConfig((c) => ({ ...c, includeContent: !c.includeContent }))
                }
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
                  config.includeContent ? "bg-primary" : "bg-input"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out ${
                    config.includeContent ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </>
        )}

        <Button onClick={handleSave} disabled={isSaving} className="self-start">
          {isSaving ? "Saving…" : "Save Digest Settings"}
        </Button>
      </CardContent>
    </Card>
  );
}
