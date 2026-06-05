"use client";

import { useState, useEffect, useCallback } from "react";
import { use } from "react";
import { ArrowLeft, Hash, Loader2, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { toast } from "sonner";

interface HashtagCampaign {
  id: string;
  name: string;
  hashtags: string[];
  startDate: string;
  endDate: string | null;
  targetPlatforms: string[];
  goal: string | null;
  isActive: boolean;
}

interface ByHashtag {
  hashtag: string;
  postCount: number;
  totalEngagement: number;
}

interface ByPlatform {
  platform: string;
  postCount: number;
  totalEngagement: number;
}

interface TopPost {
  postId: string;
  content: string;
  totalEngagement: number;
  publishedAt: string | null;
}

interface DayActivity {
  date: string;
  postCount: number;
  totalEngagement: number;
}

interface PerformanceData {
  campaign: HashtagCampaign;
  totalPosts: number;
  totalImpressions: number;
  totalReach: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  avgEngagement: number;
  byHashtag: ByHashtag[];
  byPlatform: ByPlatform[];
  topPosts: TopPost[];
  dailyActivity: DayActivity[];
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold mt-1">{typeof value === "number" ? value.toLocaleString() : value}</p>
      </CardContent>
    </Card>
  );
}

export default function HashtagCampaignPerformancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/hashtag-campaigns/${id}/performance`);
      if (!res.ok) throw new Error("Failed to load performance data");
      const json = await res.json() as PerformanceData;
      setData(json);
    } catch {
      toast.error("Failed to load campaign performance");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <p className="text-muted-foreground">Campaign not found.</p>
        <Link href="/hashtag-campaigns">
          <Button variant="link" className="mt-2 p-0">← Back to Campaigns</Button>
        </Link>
      </div>
    );
  }

  const { campaign } = data;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/hashtag-campaigns">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Hash className="h-6 w-6 text-purple-500" />
            {campaign.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {new Date(campaign.startDate).toLocaleDateString()}
            {campaign.endDate ? ` → ${new Date(campaign.endDate).toLocaleDateString()}` : " → ongoing"}
          </p>
        </div>
        <Badge variant={campaign.isActive ? "default" : "secondary"} className="ml-auto">
          {campaign.isActive ? "Active" : "Paused"}
        </Badge>
      </div>

      {campaign.goal && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Campaign Goal</p>
            <p className="mt-1">{campaign.goal}</p>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-1">
        {(campaign.hashtags as string[]).map((tag) => (
          <Badge key={tag} variant="outline" className="font-mono">
            #{tag}
          </Badge>
        ))}
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Posts" value={data.totalPosts} />
        <StatCard label="Total Impressions" value={data.totalImpressions} />
        <StatCard label="Total Reach" value={data.totalReach} />
        <StatCard label="Avg Engagement" value={data.avgEngagement} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total Likes" value={data.totalLikes} />
        <StatCard label="Total Comments" value={data.totalComments} />
        <StatCard label="Total Shares" value={data.totalShares} />
      </div>

      {/* By Hashtag */}
      {data.byHashtag.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Performance by Hashtag</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-left border-b">
                  <th className="pb-2 font-medium">Hashtag</th>
                  <th className="pb-2 font-medium text-right">Posts</th>
                  <th className="pb-2 font-medium text-right">Engagement</th>
                </tr>
              </thead>
              <tbody>
                {data.byHashtag.map((row) => (
                  <tr key={row.hashtag} className="border-b last:border-0">
                    <td className="py-2 font-mono text-purple-600 dark:text-purple-400">
                      {row.hashtag}
                    </td>
                    <td className="py-2 text-right">{row.postCount}</td>
                    <td className="py-2 text-right">{row.totalEngagement.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* By Platform */}
      {data.byPlatform.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Performance by Platform</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-left border-b">
                  <th className="pb-2 font-medium">Platform</th>
                  <th className="pb-2 font-medium text-right">Posts</th>
                  <th className="pb-2 font-medium text-right">Engagement</th>
                </tr>
              </thead>
              <tbody>
                {data.byPlatform.map((row) => (
                  <tr key={row.platform} className="border-b last:border-0">
                    <td className="py-2 capitalize">{row.platform.toLowerCase()}</td>
                    <td className="py-2 text-right">{row.postCount}</td>
                    <td className="py-2 text-right">{row.totalEngagement.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Top Posts */}
      {data.topPosts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4" />
              Top Performing Posts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.topPosts.map((post, i) => (
              <div key={post.postId} className="flex items-start gap-3 border-b last:border-0 pb-3 last:pb-0">
                <span className="text-sm font-bold text-muted-foreground w-5 flex-shrink-0">
                  #{i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{post.content}</p>
                  {post.publishedAt && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(post.publishedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <Badge variant="secondary" className="flex-shrink-0">
                  {post.totalEngagement.toLocaleString()} eng.
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Daily Activity */}
      {data.dailyActivity.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daily Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-left border-b">
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium text-right">Posts</th>
                  <th className="pb-2 font-medium text-right">Engagement</th>
                </tr>
              </thead>
              <tbody>
                {data.dailyActivity.map((day) => (
                  <tr key={day.date} className="border-b last:border-0">
                    <td className="py-2">{day.date}</td>
                    <td className="py-2 text-right">{day.postCount}</td>
                    <td className="py-2 text-right">{day.totalEngagement.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {data.totalPosts === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <Hash className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No matching posts found</p>
            <p className="text-sm mt-1">
              Publish posts containing these hashtags within the campaign date range to see performance data.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
