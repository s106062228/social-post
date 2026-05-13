import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PostStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { analyzeReadability } from "@/lib/readability";

const querySchema = z.object({
  period: z.enum(["7d", "30d", "90d"]).default("30d"),
});

export interface ContentQualityResponse {
  period: string;
  totalPosts: number;
  sentiment: {
    POSITIVE: number;
    NEUTRAL: number;
    NEGATIVE: number;
    unanalyzed: number;
    positivePercent: number;
    neutralPercent: number;
    negativePercent: number;
  };
  readability: {
    "very-easy": number;
    easy: number;
    medium: number;
    hard: number;
    "very-hard": number;
  };
  wordCount: {
    avg: number;
    median: number;
    min: number;
    max: number;
  };
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

// ── GET /api/analytics/content-quality ───────────────────────────────────────

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
    const periodDays = period === "7d" ? 7 : period === "30d" ? 30 : 90;

    const since = new Date();
    since.setDate(since.getDate() - periodDays);
    since.setHours(0, 0, 0, 0);

    const posts = await prisma.post.findMany({
      where: {
        userId,
        status: PostStatus.PUBLISHED,
        updatedAt: { gte: since },
        archivedAt: null,
      },
      select: {
        content: true,
        sentiment: true,
      },
    });

    const totalPosts = posts.length;

    // Sentiment distribution
    let positiveCount = 0;
    let neutralCount = 0;
    let negativeCount = 0;
    let unanalyzed = 0;

    for (const post of posts) {
      if (post.sentiment === "POSITIVE") positiveCount++;
      else if (post.sentiment === "NEUTRAL") neutralCount++;
      else if (post.sentiment === "NEGATIVE") negativeCount++;
      else unanalyzed++;
    }

    const analyzedCount = positiveCount + neutralCount + negativeCount;
    const positivePercent =
      analyzedCount > 0 ? Math.round((positiveCount / analyzedCount) * 100) : 0;
    const neutralPercent =
      analyzedCount > 0 ? Math.round((neutralCount / analyzedCount) * 100) : 0;
    const negativePercent =
      analyzedCount > 0 ? Math.round((negativeCount / analyzedCount) * 100) : 0;

    // Readability distribution + word count
    const readability = {
      "very-easy": 0,
      easy: 0,
      medium: 0,
      hard: 0,
      "very-hard": 0,
    };

    const wordCounts: number[] = [];

    for (const post of posts) {
      const result = analyzeReadability(post.content);
      readability[result.label]++;
      wordCounts.push(result.wordCount);
    }

    wordCounts.sort((a, b) => a - b);

    const avg =
      wordCounts.length > 0
        ? Math.round(wordCounts.reduce((s, n) => s + n, 0) / wordCounts.length)
        : 0;
    const med = median(wordCounts);
    const min = wordCounts.length > 0 ? wordCounts[0] : 0;
    const max = wordCounts.length > 0 ? wordCounts[wordCounts.length - 1] : 0;

    return NextResponse.json({
      period,
      totalPosts,
      sentiment: {
        POSITIVE: positiveCount,
        NEUTRAL: neutralCount,
        NEGATIVE: negativeCount,
        unanalyzed,
        positivePercent,
        neutralPercent,
        negativePercent,
      },
      readability,
      wordCount: { avg, median: med, min, max },
    } satisfies ContentQualityResponse);
  } catch (err) {
    return handleRouteError(err);
  }
}
