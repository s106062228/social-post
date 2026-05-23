import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PostStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { analyzeWritingStats, type WritingStats } from "@/lib/writing-stats";

const PERIOD_DAYS: Record<string, number | null> = {
  "30d": 30,
  "90d": 90,
  "180d": 180,
  all: null,
};

const querySchema = z.object({
  period: z.enum(["30d", "90d", "180d", "all"]).default("30d"),
});

export interface WritingStatsResponse extends WritingStats {
  period: string;
}

// ── GET /api/analytics/writing-stats ─────────────────────────────────────────

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

    const parsed = querySchema.safeParse({
      period: request.nextUrl.searchParams.get("period") ?? "30d",
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { period } = parsed.data;
    const userId = session.user.id;

    const daysBack = PERIOD_DAYS[period];
    const since =
      daysBack !== null
        ? new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)
        : undefined;

    const posts = await prisma.post.findMany({
      where: {
        userId,
        status: PostStatus.PUBLISHED,
        ...(since ? { updatedAt: { gte: since } } : {}),
      },
      select: {
        content: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 500, // cap to avoid huge payloads
    });

    const stats = analyzeWritingStats(posts);

    return NextResponse.json({
      ...stats,
      period,
    } satisfies WritingStatsResponse);
  } catch (err) {
    return handleRouteError(err);
  }
}
