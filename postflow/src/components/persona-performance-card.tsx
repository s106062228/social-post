"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users2, Loader2, AlertCircle } from "lucide-react";
import type { PersonaPerformanceResponse, PersonaPerformanceData } from "@/app/api/analytics/persona-performance/route";

type Period = "7d" | "30d" | "90d";

const PLATFORM_ABBREV: Record<string, string> = {
  FACEBOOK: "FB",
  INSTAGRAM: "IG",
  THREADS: "TH",
  TWITTER: "TW",
  LINKEDIN: "LI",
  PINTEREST: "PI",
  YOUTUBE: "YT",
  TIKTOK: "TK",
  BLUESKY: "BS",
  MASTODON: "MA",
  TELEGRAM: "TG",
  REDDIT: "RE",
  NOSTR: "NS",
  TUMBLR: "TU",
  WORDPRESS: "WP",
  MEDIUM: "MD",
  GHOST: "GH",
  DEVTO: "DV",
  GOOGLE_BUSINESS: "GB",
  HASHNODE: "HN",
  BEEHIIV: "BH",
  PIXELFED: "PX",
  VIMEO: "VI",
};

const PLATFORM_COLORS: Record<string, string> = {
  FACEBOOK: "#1877f2",
  INSTAGRAM: "#e1306c",
  THREADS: "#101010",
  TWITTER: "#1da1f2",
  LINKEDIN: "#0077b5",
  PINTEREST: "#e60023",
  YOUTUBE: "#ff0000",
  TIKTOK: "#010101",
  BLUESKY: "#0085ff",
  MASTODON: "#6364ff",
  TELEGRAM: "#26a5e4",
  REDDIT: "#ff4500",
};

function PersonaRow({
  persona,
  maxEngagement,
}: {
  persona: PersonaPerformanceData;
  maxEngagement: number;
}) {
  const barWidth =
    maxEngagement > 0
      ? Math.round((persona.avgEngagement / maxEngagement) * 100)
      : 0;

  return (
    <div className="space-y-2 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{persona.personaName}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {persona.postCount} {persona.postCount === 1 ? "post" : "posts"}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          avg {persona.avgEngagement.toFixed(1)} eng
        </span>
      </div>

      {/* Engagement bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-2 rounded-full bg-green-500 transition-all"
          style={{ width: `${barWidth}%` }}
        />
      </div>

      {/* Metrics row */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {persona.totalImpressions > 0 && (
          <span>{persona.totalImpressions.toLocaleString()} impressions</span>
        )}
        {persona.totalReach > 0 && (
          <span>{persona.totalReach.toLocaleString()} reach</span>
        )}
      </div>

      {/* Platform chips */}
      {persona.platforms.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {persona.platforms.map(({ platform, count }) => (
            <span
              key={platform}
              className="rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
              style={{ backgroundColor: PLATFORM_COLORS[platform] ?? "#94a3b8" }}
              title={`${platform}: ${count}`}
            >
              {PLATFORM_ABBREV[platform] ?? platform.slice(0, 2)}
              {count > 1 ? ` ×${count}` : ""}
            </span>
          ))}
        </div>
      )}

      {/* Top post preview */}
      {persona.topPost && (
        <p className="text-[11px] italic text-muted-foreground line-clamp-2">
          &ldquo;{persona.topPost.content}&rdquo;
        </p>
      )}
    </div>
  );
}

export function PersonaPerformanceCard() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<PersonaPerformanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (p: Period) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/persona-performance?period=${p}`);
      if (!res.ok) throw new Error("Failed to load persona performance data");
      const json = (await res.json()) as PersonaPerformanceResponse;
      setData(json);
    } catch {
      setError("Failed to load persona performance data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(period);
  }, [fetchData, period]);

  const namedPersonas = data?.personas.filter((p) => p.personaId !== null) ?? [];
  const unassigned = data?.personas.find((p) => p.personaId === null);
  const hasData =
    (namedPersonas.length > 0 && namedPersonas.some((p) => p.postCount > 0)) ||
    (unassigned !== undefined && unassigned.postCount > 0);

  const maxEngagement = Math.max(
    ...(data?.personas.map((p) => p.avgEngagement) ?? [0]),
    0
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users2 className="h-5 w-5 text-violet-500" />
            <CardTitle>Audience Persona Performance</CardTitle>
          </div>
          <div className="flex gap-1">
            {(["7d", "30d", "90d"] as Period[]).map((p) => (
              <Button
                key={p}
                variant={period === p ? "default" : "ghost"}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setPeriod(p)}
              >
                {p}
              </Button>
            ))}
          </div>
        </div>
        <CardDescription>
          Published post performance grouped by target audience persona
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && !loading && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {!loading && !error && !hasData && (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Users2 className="mx-auto mb-2 h-8 w-8 opacity-30" />
            <p>No persona performance data yet.</p>
            <p className="mt-1">
              Create audience personas in{" "}
              <Link href="/audience-personas" className="underline hover:text-foreground">
                Audience Personas
              </Link>{" "}
              and assign them to posts to see performance breakdowns.
            </p>
          </div>
        )}

        {!loading && !error && hasData && data && (
          <div className="divide-y">
            {/* Named personas */}
            {namedPersonas
              .filter((p) => p.postCount > 0)
              .map((persona) => (
                <PersonaRow
                  key={persona.personaId}
                  persona={persona}
                  maxEngagement={maxEngagement}
                />
              ))}

            {/* Unassigned separator */}
            {unassigned && unassigned.postCount > 0 && (
              <>
                {namedPersonas.some((p) => p.postCount > 0) && (
                  <div className="py-2 text-xs font-medium text-muted-foreground">
                    — Unassigned —
                  </div>
                )}
                <PersonaRow
                  persona={unassigned}
                  maxEngagement={maxEngagement}
                />
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
