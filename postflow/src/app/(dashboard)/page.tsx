import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { PostStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  FileText,
  Calendar,
  Users,
  Plus,
  AlertCircle,
  CheckCircle,
  Clock,
  Activity,
} from "lucide-react";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { UpcomingPostsCard } from "@/components/upcoming-posts-card";
import { FailedPostsAlert } from "@/components/failed-posts-alert";
import { PlatformPublishBreakdown } from "@/components/platform-publish-breakdown";
import { Platform } from "@prisma/client";

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);

  const [
    totalPosts,
    scheduledCount,
    publishedThisWeek,
    failedCount,
    connectedAccounts,
    draftsCount,
    upcomingPosts,
    failedPosts,
    recentActivity,
    platformPublishResults,
    recentPosts,
  ] = await Promise.all([
    prisma.post.count({ where: { userId, archivedAt: null } }),
    prisma.post.count({
      where: { userId, status: PostStatus.SCHEDULED, archivedAt: null },
    }),
    prisma.post.count({
      where: {
        userId,
        status: PostStatus.PUBLISHED,
        updatedAt: { gte: weekAgo },
      },
    }),
    prisma.post.count({
      where: { userId, status: PostStatus.FAILED, archivedAt: null },
    }),
    prisma.socialAccount.count({ where: { userId, isActive: true } }),
    prisma.post.count({
      where: { userId, status: PostStatus.DRAFT, archivedAt: null },
    }),
    prisma.post.findMany({
      where: {
        userId,
        status: PostStatus.SCHEDULED,
        scheduledAt: { gte: new Date() },
        archivedAt: null,
      },
      orderBy: { scheduledAt: "asc" },
      take: 5,
      select: {
        id: true,
        content: true,
        scheduledAt: true,
        publishResults: {
          select: { platform: true },
          distinct: ["platform"],
        },
      },
    }),
    prisma.post.findMany({
      where: { userId, status: PostStatus.FAILED, archivedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        content: true,
        updatedAt: true,
        publishResults: {
          where: { status: "FAILED" },
          select: { platform: true },
        },
      },
    }),
    prisma.activityLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        action: true,
        entityType: true,
        createdAt: true,
      },
    }),
    prisma.publishResult.groupBy({
      by: ["platform"],
      where: {
        post: { userId },
        status: "PUBLISHED",
        publishedAt: { gte: monthAgo },
      },
      _count: { id: true },
    }),
    prisma.post.findMany({
      where: { userId, archivedAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        content: true,
        status: true,
        scheduledAt: true,
        createdAt: true,
      },
    }),
  ]);

  const platformBreakdown = (Object.values(Platform) as Platform[])
    .map((platform) => {
      const found = platformPublishResults.find(
        (r: { platform: Platform; _count: { id: number } }) => r.platform === platform
      );
      return { platform, publishedCount: found ? found._count.id : 0 };
    })
    .filter((p: { platform: Platform; publishedCount: number }) => p.publishedCount > 0)
    .sort(
      (a: { publishedCount: number }, b: { publishedCount: number }) =>
        b.publishedCount - a.publishedCount
    );

  type UpcomingPost = {
    id: string;
    content: string;
    scheduledAt: Date | null;
    publishResults: { platform: Platform }[];
  };

  type FailedPost = {
    id: string;
    content: string;
    updatedAt: Date;
    publishResults: { platform: Platform }[];
  };

  const upcomingForCard = (upcomingPosts as UpcomingPost[]).map((p) => ({
    id: p.id,
    content: p.content,
    scheduledAt: p.scheduledAt?.toISOString() ?? null,
    platforms: p.publishResults.map((r) => r.platform as string),
  }));

  const failedForCard = (failedPosts as FailedPost[]).map((p) => ({
    id: p.id,
    content: p.content,
    updatedAt: p.updatedAt.toISOString(),
    failedPlatforms: p.publishResults.map((r) => r.platform as string),
  }));

  return (
    <div className="flex flex-col gap-6 p-8">
      {/* Onboarding checklist — shown until dismissed or all steps complete */}
      <OnboardingChecklist />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back, {session?.user?.name ?? session?.user?.email}
          </p>
        </div>
        <Button asChild>
          <Link href="/posts/new">
            <Plus className="mr-2 h-4 w-4" />
            New post
          </Link>
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalPosts}</div>
            <p className="text-xs text-muted-foreground">{draftsCount} draft{draftsCount !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{scheduledCount}</div>
          </CardContent>
        </Card>
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">This Week</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{publishedThisWeek}</div>
            <p className="text-xs text-muted-foreground">published</p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${failedCount > 0 ? "text-red-600" : "text-muted-foreground"}`}>
              {failedCount}
            </div>
          </CardContent>
        </Card>
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Accounts</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{connectedAccounts}</div>
            {connectedAccounts === 0 && (
              <p className="text-xs text-muted-foreground">
                <Link href="/accounts" className="underline">
                  Connect one
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Calendar</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" className="w-full text-xs" asChild>
              <Link href="/calendar">View</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Failed posts alert */}
      {failedCount > 0 && <FailedPostsAlert posts={failedForCard} />}

      {/* Main content grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upcoming posts */}
        <UpcomingPostsCard posts={upcomingForCard} />

        {/* Platform breakdown */}
        <PlatformPublishBreakdown breakdown={platformBreakdown} />
      </div>

      {/* Recent activity + Recent posts grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent activity */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Recent Activity
                </CardTitle>
                <CardDescription>Latest actions in your account</CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/activity">View all</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No activity yet</p>
            ) : (
              <div className="divide-y">
                {recentActivity.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm capitalize">
                        {a.action.replace(/[._]/g, " ")}
                      </p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {a.entityType?.toLowerCase() ?? "system"} ·{" "}
                        {new Date(a.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent posts */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Posts</CardTitle>
                <CardDescription>Your latest post activity</CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/posts">View all</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {recentPosts.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <FileText className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No posts yet</p>
                <Button size="sm" asChild>
                  <Link href="/posts/new">Create your first post</Link>
                </Button>
              </div>
            ) : (
              <div className="divide-y">
                {recentPosts.map((post) => (
                  <div key={post.id} className="flex items-center gap-4 py-3">
                    <div className="flex-1 truncate">
                      <p className="truncate text-sm">{post.content}</p>
                      <p className="text-xs text-muted-foreground">
                        {post.scheduledAt
                          ? `Scheduled: ${new Date(post.scheduledAt).toLocaleString()}`
                          : `Created: ${new Date(post.createdAt).toLocaleString()}`}
                      </p>
                    </div>
                    <StatusBadge status={post.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-700",
    SCHEDULED: "bg-blue-100 text-blue-700",
    PUBLISHING: "bg-yellow-100 text-yellow-700",
    PUBLISHED: "bg-green-100 text-green-700",
    PARTIALLY_PUBLISHED: "bg-orange-100 text-orange-700",
    FAILED: "bg-red-100 text-red-700",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? "bg-gray-100 text-gray-700"}`}
    >
      {status.replace("_", " ").toLowerCase()}
    </span>
  );
}
