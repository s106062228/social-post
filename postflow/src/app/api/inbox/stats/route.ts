import { type NextRequest, NextResponse } from "next/server";
import { Platform } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

interface PlatformBreakdown {
  platform: string;
  total: number;
  unread: number;
  replied: number;
}

interface DailyVolume {
  date: string;
  count: number;
}

// ── GET /api/inbox/stats ──────────────────────────────────────────────────────

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const rl = await apiLimiter(userId, { limit: 60, windowMs: 60_000 });
  if (!rl.success) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  try {
    const DAYS = 30;
    const since = new Date();
    since.setDate(since.getDate() - DAYS);
    since.setHours(0, 0, 0, 0);

    // Fetch all comments plus aggregate rule match counts in parallel
    const [comments, ruleMatchTotal] = await Promise.all([
      prisma.socialComment.findMany({
        where: { userId },
        select: {
          id: true,
          isRead: true,
          isReplied: true,
          platform: true,
          postedAt: true,
        },
        orderBy: { postedAt: "asc" },
      }),
      // Sum of all matchCounts = total auto-replies triggered
      prisma.autoReplyRule
        .aggregate({ where: { userId }, _sum: { matchCount: true } })
        .then((r) => r._sum.matchCount ?? 0),
    ]);

    const totalComments = comments.length;
    const unreadCount = comments.filter((c) => !c.isRead).length;
    const repliedCount = comments.filter((c) => c.isReplied).length;
    const autoRepliedCount = ruleMatchTotal;
    const responseRate =
      totalComments > 0 ? Math.round((repliedCount / totalComments) * 100) : 0;

    // Platform breakdown
    const platformMap = new Map<
      string,
      { total: number; unread: number; replied: number }
    >();
    for (const c of comments) {
      const key = c.platform as string;
      if (!platformMap.has(key)) {
        platformMap.set(key, { total: 0, unread: 0, replied: 0 });
      }
      const entry = platformMap.get(key)!;
      entry.total++;
      if (!c.isRead) entry.unread++;
      if (c.isReplied) entry.replied++;
    }
    const platformBreakdown: PlatformBreakdown[] = Array.from(
      platformMap.entries()
    )
      .map(([platform, counts]) => ({ platform, ...counts }))
      .sort((a, b) => b.total - a.total);

    // Daily volume — last 30 days from postedAt
    const dayMap = new Map<string, number>();
    for (let i = 0; i <= DAYS; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      dayMap.set(d.toISOString().slice(0, 10), 0);
    }
    for (const c of comments) {
      const key = new Date(c.postedAt).toISOString().slice(0, 10);
      const existing = dayMap.get(key);
      if (existing !== undefined) {
        dayMap.set(key, existing + 1);
      }
    }
    const dailyVolume: DailyVolume[] = Array.from(dayMap.entries()).map(
      ([date, count]) => ({ date, count })
    );

    return NextResponse.json({
      totalComments,
      unreadCount,
      repliedCount,
      autoRepliedCount,
      responseRate,
      platformBreakdown,
      dailyVolume,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
