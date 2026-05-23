import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { PostStatus, Platform } from "@prisma/client";

export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const rl = await apiLimiter(userId);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

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
          entityId: true,
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
    ]);

    type GroupByResult = { platform: Platform; _count: { id: number } };
    const platformBreakdown = (Object.values(Platform) as Platform[])
      .map((platform) => {
        const found = platformPublishResults.find(
          (r: GroupByResult) => r.platform === platform
        );
        return { platform, publishedCount: found ? found._count.id : 0 };
      })
      .filter((p: { platform: Platform; publishedCount: number }) => p.publishedCount > 0)
      .sort(
        (a: { publishedCount: number }, b: { publishedCount: number }) =>
          b.publishedCount - a.publishedCount
      );

    return NextResponse.json({
      stats: {
        totalPosts,
        scheduledCount,
        publishedThisWeek,
        failedCount,
        connectedAccounts,
        draftsCount,
      },
      upcomingPosts: upcomingPosts.map(
        (p: { id: string; content: string; scheduledAt: Date | null; publishResults: { platform: Platform }[] }) => ({
          id: p.id,
          content: p.content,
          scheduledAt: p.scheduledAt,
          platforms: p.publishResults.map((r: { platform: Platform }) => r.platform),
        })
      ),
      failedPosts: failedPosts.map(
        (p: { id: string; content: string; updatedAt: Date; publishResults: { platform: Platform }[] }) => ({
          id: p.id,
          content: p.content,
          updatedAt: p.updatedAt,
          failedPlatforms: p.publishResults.map((r: { platform: Platform }) => r.platform),
        })
      ),
      recentActivity: recentActivity.map(
        (a: { id: string; action: string; entityType: string | null; entityId: string | null; createdAt: Date }) => ({
          id: a.id,
          action: a.action,
          entityType: a.entityType,
          entityId: a.entityId,
          createdAt: a.createdAt,
        })
      ),
      platformBreakdown,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
