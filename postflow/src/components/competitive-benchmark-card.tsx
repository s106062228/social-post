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
import { Swords, ChevronDown, ChevronRight, User, Trophy, Plus } from "lucide-react";
import Link from "next/link";

interface UserAccountEntry {
  accountId: string;
  accountName: string;
  followersCount: number | null;
  avgEngagementRate: number | null;
  postsPerWeek: number | null;
}

interface CompetitorEntry {
  competitorId: string;
  name: string;
  handle: string;
  profileUrl: string | null;
  followersCount: number | null;
  avgEngagementRate: number | null;
  postsPerWeek: number | null;
}

interface PlatformData {
  platform: string;
  userAccounts: UserAccountEntry[];
  competitors: CompetitorEntry[];
  bestFollowers: number | null;
  bestEngagement: number | null;
}

interface BenchmarkResponse {
  platforms: PlatformData[];
}

function fmt(val: number | null, decimals = 0): string {
  if (val === null) return "—";
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return decimals > 0 ? val.toFixed(decimals) : val.toLocaleString();
}

function isBest(val: number | null, best: number | null): boolean {
  return val !== null && best !== null && val >= best;
}

function GapBadge({
  val,
  best,
}: {
  val: number | null;
  best: number | null;
}) {
  if (val === null || best === null || best === 0) return <span className="text-muted-foreground text-xs">—</span>;
  if (isBest(val, best)) {
    return <Badge className="bg-green-100 text-green-800 text-xs">Best</Badge>;
  }
  const gap = ((best - val) / best) * 100;
  return (
    <span className="text-xs text-orange-600">-{gap.toFixed(0)}%</span>
  );
}

function PlatformSection({ data }: { data: PlatformData }) {
  const [open, setOpen] = useState(true);

  const hasData = data.userAccounts.length > 0 || data.competitors.length > 0;

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between w-full p-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="font-medium text-sm">{data.platform}</span>
          <span className="text-xs text-muted-foreground">
            {data.userAccounts.length} you · {data.competitors.length} competitors
          </span>
        </div>
        {data.bestFollowers !== null && (
          <span className="text-xs text-muted-foreground">
            Best: {fmt(data.bestFollowers)} followers
          </span>
        )}
      </button>

      {open && (
        <div className="p-3">
          {!hasData ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No data yet.{" "}
              <Link href="/competitors" className="underline">
                Add a competitor
              </Link>{" "}
              to compare.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b">
                    <th className="text-left py-2 pr-4 font-medium">Account</th>
                    <th className="text-right py-2 px-2 font-medium">Followers</th>
                    <th className="text-right py-2 px-2 font-medium">Eng. Rate</th>
                    <th className="text-right py-2 px-2 font-medium">Posts/Wk</th>
                    <th className="text-right py-2 pl-2 font-medium">Followers Gap</th>
                    <th className="text-right py-2 pl-2 font-medium">Eng. Gap</th>
                  </tr>
                </thead>
                <tbody>
                  {data.userAccounts.map((a) => (
                    <tr key={a.accountId} className="border-b last:border-0 bg-blue-50/30">
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-1.5">
                          <User className="h-3 w-3 text-blue-500 shrink-0" />
                          <span className="font-medium text-blue-700">{a.accountName}</span>
                          <Badge variant="outline" className="text-xs py-0 h-4">You</Badge>
                        </div>
                      </td>
                      <td className="text-right py-2 px-2 tabular-nums">
                        {isBest(a.followersCount, data.bestFollowers) && (
                          <Trophy className="inline h-3 w-3 text-amber-500 mr-1" />
                        )}
                        {fmt(a.followersCount)}
                      </td>
                      <td className="text-right py-2 px-2 tabular-nums">
                        {isBest(a.avgEngagementRate, data.bestEngagement) && (
                          <Trophy className="inline h-3 w-3 text-amber-500 mr-1" />
                        )}
                        {a.avgEngagementRate !== null ? `${fmt(a.avgEngagementRate, 2)}%` : "—"}
                      </td>
                      <td className="text-right py-2 px-2 tabular-nums">
                        {fmt(a.postsPerWeek, 1)}
                      </td>
                      <td className="text-right py-2 pl-2">
                        <GapBadge val={a.followersCount} best={data.bestFollowers} />
                      </td>
                      <td className="text-right py-2 pl-2">
                        <GapBadge val={a.avgEngagementRate} best={data.bestEngagement} />
                      </td>
                    </tr>
                  ))}
                  {data.competitors.map((c) => (
                    <tr key={c.competitorId} className="border-b last:border-0">
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-1.5">
                          <Swords className="h-3 w-3 text-muted-foreground shrink-0" />
                          <div>
                            <span className="font-medium">{c.name}</span>
                            <span className="text-xs text-muted-foreground ml-1">@{c.handle}</span>
                          </div>
                        </div>
                      </td>
                      <td className="text-right py-2 px-2 tabular-nums">
                        {isBest(c.followersCount, data.bestFollowers) && (
                          <Trophy className="inline h-3 w-3 text-amber-500 mr-1" />
                        )}
                        {fmt(c.followersCount)}
                      </td>
                      <td className="text-right py-2 px-2 tabular-nums">
                        {isBest(c.avgEngagementRate, data.bestEngagement) && (
                          <Trophy className="inline h-3 w-3 text-amber-500 mr-1" />
                        )}
                        {c.avgEngagementRate !== null ? `${fmt(c.avgEngagementRate, 2)}%` : "—"}
                      </td>
                      <td className="text-right py-2 px-2 tabular-nums">
                        {fmt(c.postsPerWeek, 1)}
                      </td>
                      <td className="text-right py-2 pl-2">
                        <GapBadge val={c.followersCount} best={data.bestFollowers} />
                      </td>
                      <td className="text-right py-2 pl-2">
                        <GapBadge val={c.avgEngagementRate} best={data.bestEngagement} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CompetitiveBenchmarkCard() {
  const [data, setData] = useState<BenchmarkResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analytics/competitive-benchmark");
      if (!res.ok) throw new Error("Failed to load data");
      const json = (await res.json()) as BenchmarkResponse;
      setData(json);
    } catch {
      setError("Failed to load competitive benchmark data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Swords className="h-5 w-5" />
              Competitor Benchmarking
            </CardTitle>
            <CardDescription>
              Compare your accounts against tracked competitors by platform.
            </CardDescription>
          </div>
          <Link href="/competitors">
            <Button variant="outline" size="sm" className="gap-1">
              <Plus className="h-3 w-3" />
              Manage
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive text-center py-4">{error}</p>
        )}

        {!loading && !error && data && (
          <>
            {data.platforms.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Swords className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No data yet.</p>
                <p className="text-xs mt-1">
                  Connect social accounts and{" "}
                  <Link href="/competitors" className="underline">
                    add competitors
                  </Link>{" "}
                  to start benchmarking.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {data.platforms.map((p) => (
                  <PlatformSection key={p.platform} data={p} />
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
