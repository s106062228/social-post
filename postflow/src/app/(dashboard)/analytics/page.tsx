import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Platform, PublishStatus, PostStatus, MediaType } from "@prisma/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  BarChart2,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  Image,
  Video,
  AlignLeft,
  Layers,
} from "lucide-react";

export default async function AnalyticsPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    totalPosts,
    publishedPosts,
    failedPosts,
    scheduledPosts,
    draftPosts,
    allPublishResults,
    recentPosts,
    mediaBreakdown,
  ] = await Promise.all([
    prisma.post.count({ where: { userId } }),
    prisma.post.count({ where: { userId, status: PostStatus.PUBLISHED } }),
    prisma.post.count({ where: { userId, status: PostStatus.FAILED } }),
    prisma.post.count({ where: { userId, status: PostStatus.SCHEDULED } }),
    prisma.post.count({ where: { userId, status: PostStatus.DRAFT } }),
    prisma.publishResult.findMany({
      where: { post: { userId } },
      select: { platform: true, status: true, retryCount: true, publishedAt: true },
    }),
    prisma.post.findMany({
      where: { userId, createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true, status: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.post.groupBy({
      by: ["mediaType"],
      where: { userId },
      _count: { mediaType: true },
    }),
  ]);

  // Platform breakdown
  const platformStats = Object.values(Platform).map((platform) => {
    const results = allPublishResults.filter((r) => r.platform === platform);
    const published = results.filter((r) => r.status === PublishStatus.PUBLISHED).length;
    const failed = results.filter((r) => r.status === PublishStatus.FAILED).length;
    const pending = results.filter(
      (r) => r.status === PublishStatus.PENDING || r.status === PublishStatus.PROCESSING
    ).length;
    const total = results.length;
    const successRate = total > 0 ? Math.round((published / total) * 100) : 0;
    return { platform, published, failed, pending, total, successRate };
  });

  // Overall publish success rate
  const totalPublishResults = allPublishResults.length;
  const totalPublished = allPublishResults.filter(
    (r) => r.status === PublishStatus.PUBLISHED
  ).length;
  const totalFailed = allPublishResults.filter(
    (r) => r.status === PublishStatus.FAILED
  ).length;
  const overallSuccessRate =
    totalPublishResults > 0
      ? Math.round((totalPublished / totalPublishResults) * 100)
      : 0;

  // Posts per day (last 30 days)
  const dailyCounts: Record<string, number> = {};
  for (const post of recentPosts) {
    const day = post.createdAt.toISOString().slice(0, 10);
    dailyCounts[day] = (dailyCounts[day] ?? 0) + 1;
  }
  const dailyData = Object.entries(dailyCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14); // last 14 days

  const maxDailyCount = Math.max(...dailyData.map(([, c]) => c), 1);

  // Media type icons
  const mediaIcons: Record<MediaType, typeof AlignLeft> = {
    NONE: AlignLeft,
    IMAGE: Image,
    VIDEO: Video,
    CAROUSEL: Layers,
  };

  const platformColors: Record<Platform, string> = {
    FACEBOOK: "text-blue-600",
    INSTAGRAM: "text-pink-600",
    THREADS: "text-gray-800",
  };

  const platformBg: Record<Platform, string> = {
    FACEBOOK: "bg-blue-50",
    INSTAGRAM: "bg-pink-50",
    THREADS: "bg-gray-50",
  };

  return (
    <div className="flex flex-col gap-8 p-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground">
          Publishing insights and performance overview
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Posts</CardTitle>
            <BarChart2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalPosts}</div>
            <p className="text-xs text-muted-foreground">
              {draftPosts} draft · {scheduledPosts} scheduled
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Published</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{publishedPosts}</div>
            <p className="text-xs text-muted-foreground">
              {totalPosts > 0
                ? Math.round((publishedPosts / totalPosts) * 100)
                : 0}
              % of all posts
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{failedPosts}</div>
            <p className="text-xs text-muted-foreground">
              {totalFailed} publish attempts failed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overallSuccessRate}%</div>
            <p className="text-xs text-muted-foreground">
              {totalPublished} / {totalPublishResults} publish attempts
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Platform breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Platform Performance</CardTitle>
            <CardDescription>Publish success rate by platform</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {platformStats.map(({ platform, published, failed, total, successRate }) => (
              <div key={platform} className={`rounded-lg p-4 ${platformBg[platform]}`}>
                <div className="mb-2 flex items-center justify-between">
                  <span className={`text-sm font-semibold ${platformColors[platform]}`}>
                    {platform.charAt(0) + platform.slice(1).toLowerCase()}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {total === 0 ? "No data" : `${successRate}% success`}
                  </span>
                </div>
                {total > 0 && (
                  <>
                    <div className="mb-1 h-2 w-full overflow-hidden rounded-full bg-white/60">
                      <div
                        className="h-2 rounded-full bg-green-500 transition-all"
                        style={{ width: `${successRate}%` }}
                      />
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        {published} published
                      </span>
                      <span className="flex items-center gap-1">
                        <XCircle className="h-3 w-3 text-red-500" />
                        {failed} failed
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-blue-500" />
                        {total - published - failed} pending
                      </span>
                    </div>
                  </>
                )}
                {total === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No posts published to this platform yet
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Media type breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Content Types</CardTitle>
            <CardDescription>Posts by media format</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {mediaBreakdown.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No posts yet
              </p>
            ) : (
              mediaBreakdown
                .sort((a, b) => b._count.mediaType - a._count.mediaType)
                .map(({ mediaType, _count }) => {
                  const Icon = mediaIcons[mediaType];
                  const pct =
                    totalPosts > 0
                      ? Math.round((_count.mediaType / totalPosts) * 100)
                      : 0;
                  const labels: Record<MediaType, string> = {
                    NONE: "Text only",
                    IMAGE: "Image",
                    VIDEO: "Video",
                    CAROUSEL: "Carousel",
                  };
                  return (
                    <div key={mediaType} className="flex items-center gap-3">
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="flex-1">
                        <div className="mb-1 flex justify-between text-sm">
                          <span className="font-medium">{labels[mediaType]}</span>
                          <span className="text-muted-foreground">
                            {_count.mediaType} ({pct}%)
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-accent">
                          <div
                            className="h-2 rounded-full bg-primary transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity chart — last 14 days */}
      <Card>
        <CardHeader>
          <CardTitle>Posting Activity</CardTitle>
          <CardDescription>Posts created per day (last 14 days)</CardDescription>
        </CardHeader>
        <CardContent>
          {dailyData.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No posts in the last 30 days
            </p>
          ) : (
            <div className="flex h-40 items-end gap-1">
              {dailyData.map(([date, count]) => {
                const heightPct = Math.round((count / maxDailyCount) * 100);
                const label = new Date(date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                });
                return (
                  <div
                    key={date}
                    className="group relative flex flex-1 flex-col items-center gap-1"
                  >
                    <span className="absolute -top-5 hidden text-xs text-muted-foreground group-hover:block">
                      {count}
                    </span>
                    <div
                      className="w-full rounded-t bg-primary transition-all"
                      style={{ height: `${heightPct}%` }}
                    />
                    <span className="mt-1 text-[10px] text-muted-foreground">
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Post status breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Post Status Breakdown</CardTitle>
          <CardDescription>Distribution of all posts by current status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {(
              [
                { status: "DRAFT", count: draftPosts, color: "bg-gray-100 text-gray-700" },
                { status: "SCHEDULED", count: scheduledPosts, color: "bg-blue-100 text-blue-700" },
                {
                  status: "PUBLISHING",
                  count: totalPosts - draftPosts - scheduledPosts - publishedPosts - failedPosts,
                  color: "bg-yellow-100 text-yellow-700",
                },
                { status: "PUBLISHED", count: publishedPosts, color: "bg-green-100 text-green-700" },
                { status: "FAILED", count: failedPosts, color: "bg-red-100 text-red-700" },
              ] as const
            ).map(({ status, count, color }) => (
              <div key={status} className={`rounded-lg p-3 text-center ${color}`}>
                <div className="text-2xl font-bold">{count}</div>
                <div className="mt-1 text-xs font-medium">
                  {status.replace("_", " ").toLowerCase()}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
