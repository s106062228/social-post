import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { PostStatus } from "@prisma/client";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
): Promise<NextResponse> {
  try {
    const { token } = await params;

    const share = await prisma.calendarShare.findUnique({
      where: { token },
    });

    if (!share) {
      return NextResponse.json({ error: "Calendar not found" }, { status: 404 });
    }

    if (share.expiresAt && share.expiresAt < new Date()) {
      return NextResponse.json({ error: "Calendar share has expired" }, { status: 410 });
    }

    // Build post filter
    const dateFilter: Record<string, unknown> = {};
    if (share.startDate) {
      dateFilter.gte = new Date(share.startDate);
    }
    if (share.endDate) {
      const end = new Date(share.endDate);
      end.setHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }

    const posts = await prisma.post.findMany({
      where: {
        userId: share.userId,
        status: { in: [PostStatus.SCHEDULED, PostStatus.PUBLISHED] },
        scheduledAt: {
          not: null,
          ...(Object.keys(dateFilter).length > 0 ? dateFilter : {}),
        },
        ...(share.platforms.length > 0
          ? {
              publishResults: {
                some: { platform: { in: share.platforms } },
              },
            }
          : {}),
      },
      orderBy: { scheduledAt: "asc" },
      select: {
        id: true,
        content: share.showContent,
        scheduledAt: true,
        status: true,
        mediaType: true,
        publishResults: {
          select: { platform: true, status: true },
        },
      },
    });

    // Increment view count fire-and-forget
    prisma.calendarShare
      .update({
        where: { token },
        data: { views: { increment: 1 } },
      })
      .catch(() => {});

    const calendarPosts = posts
      .filter((p) => p.scheduledAt !== null)
      .map((p) => ({
        id: p.id,
        content: share.showContent ? p.content : null,
        scheduledAt: p.scheduledAt!.toISOString(),
        status: p.status,
        mediaType: p.mediaType,
        platforms: [...new Set(p.publishResults.map((r) => r.platform))],
      }));

    return NextResponse.json({
      title: share.title,
      showContent: share.showContent,
      startDate: share.startDate,
      endDate: share.endDate,
      platforms: share.platforms,
      expiresAt: share.expiresAt?.toISOString() ?? null,
      views: share.views,
      posts: calendarPosts,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
