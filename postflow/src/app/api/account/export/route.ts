import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { Redis } from "ioredis";
import { logActivity } from "@/lib/activity-log";

// Strict rate limit: 3 exports per hour per user
const EXPORT_WINDOW_SECONDS = 3600;
const EXPORT_MAX_REQUESTS = 3;

async function checkExportRateLimit(userId: string): Promise<{ success: boolean }> {
  try {
    const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
    const key = `export_rl:${userId}`;
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, EXPORT_WINDOW_SECONDS);
    }
    await redis.quit();
    return { success: current <= EXPORT_MAX_REQUESTS };
  } catch {
    // If Redis is unavailable, allow the request
    return { success: true };
  }
}

// ── GET /api/account/export ───────────────────────────────────────────────────

export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    const rl = await checkExportRateLimit(userId);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many export requests. You can export at most 3 times per hour." },
        { status: 429 }
      );
    }

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    // Fetch all user data in parallel
    const [
      user,
      socialAccounts,
      posts,
      templates,
      campaigns,
      tags,
      hashtagGroups,
      activityLogs,
      settings,
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          timezone: true,
          emailNotifications: true,
          theme: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.socialAccount.findMany({
        where: { userId },
        select: {
          id: true,
          platform: true,
          platformAccountId: true,
          accountName: true,
          tokenExpiresAt: true,
          scopes: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          // encryptedToken intentionally excluded
        },
      }),
      prisma.post.findMany({
        where: { userId },
        select: {
          id: true,
          content: true,
          mediaType: true,
          mediaUrls: true,
          status: true,
          scheduledAt: true,
          createdAt: true,
          updatedAt: true,
          publishResults: {
            select: {
              platform: true,
              status: true,
              platformPostId: true,
              publishedUrl: true,
              publishedAt: true,
              error: true,
              retryCount: true,
            },
          },
          tags: {
            select: {
              tag: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.template.findMany({
        where: { userId },
        select: {
          id: true,
          name: true,
          content: true,
          mediaType: true,
          mediaUrls: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.campaign.findMany({
        where: { userId },
        select: {
          id: true,
          name: true,
          description: true,
          goal: true,
          startDate: true,
          endDate: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.tag.findMany({
        where: { userId },
        select: {
          id: true,
          name: true,
          color: true,
          createdAt: true,
        },
        orderBy: { name: "asc" },
      }),
      prisma.hashtagGroup.findMany({
        where: { userId },
        select: {
          id: true,
          name: true,
          hashtags: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { name: "asc" },
      }),
      prisma.activityLog.findMany({
        where: {
          userId,
          createdAt: { gte: ninetyDaysAgo },
        },
        select: {
          id: true,
          action: true,
          entityId: true,
          entityType: true,
          metadata: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          timezone: true,
          emailNotifications: true,
          theme: true,
          publishingPaused: true,
          publishingPausedReason: true,
        },
      }),
    ]);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const exportDate = new Date().toISOString().split("T")[0];

    const exportData = {
      exportedAt: new Date().toISOString(),
      exportVersion: "1.0",
      user,
      settings,
      socialAccounts,
      posts: posts.map((p) => ({
        ...p,
        tags: p.tags.map((t: { tag: { name: string } }) => t.tag.name),
      })),
      templates,
      campaigns,
      tags,
      hashtagGroups,
      activityLog: activityLogs,
      summary: {
        totalPosts: posts.length,
        totalSocialAccounts: socialAccounts.length,
        totalTemplates: templates.length,
        totalCampaigns: campaigns.length,
        totalTags: tags.length,
        totalHashtagGroups: hashtagGroups.length,
        activityLogEntries: activityLogs.length,
      },
    };

    // Log the export activity (fire-and-forget — logActivity returns void)
    logActivity({
      userId,
      action: "account.exported",
      entityId: userId,
      entityType: "user",
      metadata: { exportedAt: new Date().toISOString() },
    });

    const json = JSON.stringify(exportData, null, 2);
    const filename = `postflow-export-${exportDate}.json`;

    return new NextResponse(json, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
