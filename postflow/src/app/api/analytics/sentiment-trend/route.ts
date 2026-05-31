import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PostStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const querySchema = z.object({
  period: z.enum(["30d", "90d", "180d"]).default("30d"),
});

interface SentimentDay {
  date: string;
  positive: number;
  neutral: number;
  negative: number;
  total: number;
}

interface SentimentTrendResponse {
  period: string;
  days: SentimentDay[];
  summary: {
    positive: number;
    neutral: number;
    negative: number;
    total: number;
    positiveRate: number;
  };
}

// ── GET /api/analytics/sentiment-trend ───────────────────────────────────────

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
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }

    const { period } = parsed.data;
    const daysBack = period === "30d" ? 30 : period === "90d" ? 90 : 180;
    const since = new Date();
    since.setDate(since.getDate() - daysBack);
    since.setHours(0, 0, 0, 0);

    const posts = await prisma.post.findMany({
      where: {
        userId: session.user.id,
        status: PostStatus.PUBLISHED,
        sentiment: { not: null },
        updatedAt: { gte: since },
      },
      select: {
        sentiment: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "asc" },
    });

    // Build a date → counts map
    const dayMap = new Map<string, { positive: number; neutral: number; negative: number }>();

    // Pre-fill all days in range
    for (let i = 0; i <= daysBack; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      dayMap.set(key, { positive: 0, neutral: 0, negative: 0 });
    }

    // Tally sentiment counts per day
    for (const post of posts) {
      const key = post.updatedAt.toISOString().slice(0, 10);
      const entry = dayMap.get(key);
      if (!entry) continue;
      const s = post.sentiment?.toUpperCase();
      if (s === "POSITIVE") entry.positive++;
      else if (s === "NEGATIVE") entry.negative++;
      else entry.neutral++;
    }

    const days: SentimentDay[] = Array.from(dayMap.entries()).map(([date, counts]) => ({
      date,
      positive: counts.positive,
      neutral: counts.neutral,
      negative: counts.negative,
      total: counts.positive + counts.neutral + counts.negative,
    }));

    const summary = {
      positive: posts.filter((p) => p.sentiment?.toUpperCase() === "POSITIVE").length,
      neutral: posts.filter((p) => {
        const s = p.sentiment?.toUpperCase();
        return s !== "POSITIVE" && s !== "NEGATIVE";
      }).length,
      negative: posts.filter((p) => p.sentiment?.toUpperCase() === "NEGATIVE").length,
      total: posts.length,
      positiveRate: posts.length > 0
        ? Math.round(
            (posts.filter((p) => p.sentiment?.toUpperCase() === "POSITIVE").length /
              posts.length) *
              100
          )
        : 0,
    };

    const response: SentimentTrendResponse = { period, days, summary };
    return NextResponse.json(response);
  } catch (err) {
    return handleRouteError(err);
  }
}
