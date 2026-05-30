import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { PostStatus } from "@prisma/client";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  req: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await apiLimiter(session.user.id);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    const { id: teamId } = await params;

    // Verify team membership
    const membership = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: { teamId, userId: session.user.id },
      },
    });
    if (!membership) {
      return NextResponse.json({ error: "Not a team member" }, { status: 403 });
    }

    // Parse year/month from query params
    const searchParams = req.nextUrl.searchParams;
    const now = new Date();
    const year = parseInt(searchParams.get("year") ?? String(now.getFullYear()), 10);
    const month = parseInt(searchParams.get("month") ?? String(now.getMonth() + 1), 10);

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json(
        { error: "Invalid year or month" },
        { status: 400 }
      );
    }

    // Get all team member user IDs
    const members = await prisma.teamMember.findMany({
      where: { teamId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    const memberUserIds = members.map((m) => m.userId);

    // Build date range for the month
    const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    // Fetch posts from all team members in this month
    const posts = await prisma.post.findMany({
      where: {
        userId: { in: memberUserIds },
        status: { in: [PostStatus.SCHEDULED, PostStatus.PUBLISHED] },
        scheduledAt: { gte: startDate, lte: endDate },
      },
      orderBy: { scheduledAt: "asc" },
      select: {
        id: true,
        content: true,
        scheduledAt: true,
        status: true,
        userId: true,
        publishResults: {
          select: { platform: true },
          distinct: ["platform"],
        },
      },
    });

    // Build a map of userId → member info
    const memberMap = new Map(
      members.map((m) => [
        m.userId,
        { name: m.user.name ?? m.user.email ?? "Unknown", id: m.userId },
      ])
    );

    const calendarPosts = posts
      .filter((p) => p.scheduledAt !== null)
      .map((p) => ({
        postId: p.id,
        content: p.content,
        scheduledAt: p.scheduledAt!.toISOString(),
        status: p.status,
        platforms: p.publishResults.map((r) => r.platform),
        authorId: p.userId,
        authorName: memberMap.get(p.userId)?.name ?? "Unknown",
      }));

    return NextResponse.json({ year, month, posts: calendarPosts });
  } catch (err) {
    return handleRouteError(err);
  }
}
