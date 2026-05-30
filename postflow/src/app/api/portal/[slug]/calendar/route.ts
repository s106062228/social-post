import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { PostStatus } from "@prisma/client";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  try {
    const { slug } = await params;

    const portal = await prisma.clientPortal.findUnique({
      where: { slug },
      select: {
        userId: true,
        isPublished: true,
        showCalendar: true,
        expiresAt: true,
      },
    });

    if (!portal || !portal.isPublished) {
      return NextResponse.json({ error: "Portal not found" }, { status: 404 });
    }

    if (portal.expiresAt && portal.expiresAt < new Date()) {
      return NextResponse.json({ error: "Portal has expired" }, { status: 410 });
    }

    if (!portal.showCalendar) {
      return NextResponse.json({ error: "Calendar not enabled for this portal" }, { status: 403 });
    }

    const now = new Date();
    const past = new Date(now);
    past.setDate(past.getDate() - 30);
    const future = new Date(now);
    future.setDate(future.getDate() + 60);

    const posts = await prisma.post.findMany({
      where: {
        userId: portal.userId,
        status: { in: [PostStatus.SCHEDULED, PostStatus.PUBLISHED] },
        OR: [
          { scheduledAt: { gte: past, lte: future } },
          {
            status: PostStatus.PUBLISHED,
            updatedAt: { gte: past },
          },
        ],
      },
      orderBy: { scheduledAt: "asc" },
      select: {
        id: true,
        content: true,
        scheduledAt: true,
        status: true,
        mediaType: true,
        publishResults: {
          select: { platform: true },
        },
      },
      take: 200,
    });

    const calendarPosts = posts.map((p) => ({
      id: p.id,
      content: p.content.substring(0, 280),
      scheduledAt: p.scheduledAt?.toISOString() ?? null,
      status: p.status,
      mediaType: p.mediaType,
      platforms: [...new Set(p.publishResults.map((r) => r.platform))],
    }));

    return NextResponse.json({ posts: calendarPosts });
  } catch (err) {
    return handleRouteError(err);
  }
}
