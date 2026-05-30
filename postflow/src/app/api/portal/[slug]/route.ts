import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  try {
    const { slug } = await params;

    const portal = await prisma.clientPortal.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        accentColor: true,
        showCalendar: true,
        showAnalytics: true,
        showPosts: true,
        isPublished: true,
        expiresAt: true,
        views: true,
      },
    });

    if (!portal || !portal.isPublished) {
      return NextResponse.json({ error: "Portal not found" }, { status: 404 });
    }

    if (portal.expiresAt && portal.expiresAt < new Date()) {
      return NextResponse.json({ error: "Portal has expired" }, { status: 410 });
    }

    // Increment view count fire-and-forget
    prisma.clientPortal
      .update({
        where: { slug },
        data: { views: { increment: 1 } },
      })
      .catch(() => {});

    return NextResponse.json({
      title: portal.title,
      description: portal.description,
      accentColor: portal.accentColor,
      showCalendar: portal.showCalendar,
      showAnalytics: portal.showAnalytics,
      showPosts: portal.showPosts,
      expiresAt: portal.expiresAt?.toISOString() ?? null,
      views: portal.views,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
