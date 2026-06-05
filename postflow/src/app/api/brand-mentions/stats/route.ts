import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

export async function GET(request: NextRequest): Promise<NextResponse> {
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

    const userId = session.user.id;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [allMentions, recentMentions] = await Promise.all([
      prisma.brandMention.findMany({
        where: { userId },
        select: { sentiment: true, platform: true, responseStatus: true },
      }),
      prisma.brandMention.findMany({
        where: { userId, mentionedAt: { gte: thirtyDaysAgo } },
        select: { mentionedAt: true },
        orderBy: { mentionedAt: "asc" },
      }),
    ]);

    const total = allMentions.length;
    const bySentiment = {
      positive: allMentions.filter((m) => m.sentiment === "POSITIVE").length,
      neutral: allMentions.filter((m) => m.sentiment === "NEUTRAL").length,
      negative: allMentions.filter((m) => m.sentiment === "NEGATIVE").length,
    };

    const platformMap = new Map<string, number>();
    for (const m of allMentions) {
      if (m.platform) {
        platformMap.set(m.platform, (platformMap.get(m.platform) ?? 0) + 1);
      }
    }
    const byPlatform = Array.from(platformMap.entries())
      .map(([platform, count]) => ({ platform, count }))
      .sort((a, b) => b.count - a.count);

    const byResponseStatus = {
      none: allMentions.filter((m) => m.responseStatus === "none").length,
      acknowledged: allMentions.filter((m) => m.responseStatus === "acknowledged").length,
      replied: allMentions.filter((m) => m.responseStatus === "replied").length,
      ignored: allMentions.filter((m) => m.responseStatus === "ignored").length,
    };

    // Build 30-day daily volume
    const dailyMap = new Map<string, number>();
    for (let i = 0; i < 30; i++) {
      const d = new Date(thirtyDaysAgo);
      d.setDate(d.getDate() + i);
      dailyMap.set(d.toISOString().slice(0, 10), 0);
    }
    for (const m of recentMentions) {
      const dateKey = m.mentionedAt.toISOString().slice(0, 10);
      if (dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, (dailyMap.get(dateKey) ?? 0) + 1);
      }
    }
    const recentVolume = Array.from(dailyMap.entries()).map(([date, count]) => ({ date, count }));

    return NextResponse.json({
      total,
      bySentiment,
      byPlatform,
      byResponseStatus,
      recentVolume,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
