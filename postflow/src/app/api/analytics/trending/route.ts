import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PostStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import {
  detectEmergingHashtags,
  type TrendingHashtag,
} from "@/lib/trending";

export type { TrendingHashtag };

const querySchema = z.object({
  period: z.enum(["30d", "60d", "90d"]).default("30d"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export interface TrendingHashtagsResponse {
  period: string;
  hashtags: TrendingHashtag[];
  totalPosts: number;
}

// ── GET /api/analytics/trending ──────────────────────────────────────────────

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
      limit: request.nextUrl.searchParams.get("limit") ?? "20",
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { period, limit } = parsed.data;
    const userId = session.user.id;
    const daysBack = period === "30d" ? 30 : period === "60d" ? 60 : 90;

    const since = new Date();
    since.setDate(since.getDate() - daysBack);

    const posts = await prisma.post.findMany({
      where: {
        userId,
        status: PostStatus.PUBLISHED,
        updatedAt: { gte: since },
      },
      select: {
        content: true,
        publishResults: {
          where: { status: "PUBLISHED", publishedAt: { not: null } },
          select: {
            publishedAt: true,
            insights: {
              select: {
                likes: true,
                comments: true,
                shares: true,
                reach: true,
                impressions: true,
              },
            },
          },
        },
      },
    });

    // Flatten to per-publishResult with all insights for that publish
    const postsForTrending = posts.flatMap((post) =>
      post.publishResults
        .filter((pr) => pr.publishedAt !== null)
        .map((pr) => ({
          content: post.content,
          publishedAt: pr.publishedAt,
          insights: pr.insights ? [pr.insights] : [],
        }))
    );

    const hashtags = detectEmergingHashtags(postsForTrending, daysBack, limit);

    return NextResponse.json({
      period,
      hashtags,
      totalPosts: posts.length,
    } satisfies TrendingHashtagsResponse);
  } catch (err) {
    return handleRouteError(err);
  }
}
