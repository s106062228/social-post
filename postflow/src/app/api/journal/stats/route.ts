import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

export async function GET(_request: NextRequest): Promise<NextResponse> {
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

    const entries = await prisma.contentJournalEntry.findMany({
      where: { userId: session.user.id },
      select: { entryType: true, tags: true, rating: true, createdAt: true },
    });

    const byType: Record<string, number> = {
      SUCCESS: 0, FAILURE: 0, INSIGHT: 0, HYPOTHESIS: 0, EXPERIMENT: 0,
    };
    const tagFreq: Record<string, number> = {};
    let ratingSum = 0;
    let ratingCount = 0;

    for (const e of entries) {
      byType[e.entryType] = (byType[e.entryType] ?? 0) + 1;
      for (const t of e.tags) {
        tagFreq[t] = (tagFreq[t] ?? 0) + 1;
      }
      if (e.rating !== null) {
        ratingSum += e.rating;
        ratingCount++;
      }
    }

    const topTags = Object.entries(tagFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    const avgRating = ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 10) / 10 : null;

    return NextResponse.json({
      total: entries.length,
      byType,
      topTags,
      avgRating,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
