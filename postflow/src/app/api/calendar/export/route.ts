import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { apiLogger } from "@/lib/logger";
import { generateICalFeed } from "@/lib/ical";
import { PostStatus } from "@prisma/client";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    let userId: string | undefined;

    // Auth via session
    const session = await auth();
    if (session?.user?.id) {
      userId = session.user.id;
    } else {
      // Auth via ?token= query param (for external calendar subscriptions)
      const token = req.nextUrl.searchParams.get("token");
      if (token) {
        const calendarToken = await prisma.calendarToken.findUnique({
          where: { token },
          select: { userId: true },
        });
        if (calendarToken) {
          userId = calendarToken.userId;
        }
      }
    }

    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const posts = await prisma.post.findMany({
      where: {
        userId,
        status: { in: [PostStatus.SCHEDULED, PostStatus.PUBLISHED] },
        scheduledAt: { not: null },
      },
      orderBy: { scheduledAt: "asc" },
      select: { id: true, content: true, scheduledAt: true, status: true },
    });

    const icalPosts = posts
      .filter((p) => p.scheduledAt !== null)
      .map((p) => ({ ...p, scheduledAt: p.scheduledAt! }));

    const ical = generateICalFeed(icalPosts, "PostFlow Schedule");

    return new NextResponse(ical, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="postflow.ics"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    apiLogger.error({ error }, "calendar export error");
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
