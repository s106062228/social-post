import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Platform, PostStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import {
  computeHashtagStats,
  type HashtagStat,
} from "@/lib/hashtag-analytics";

const platformValues = Object.values(Platform) as [string, ...string[]];

const querySchema = z.object({
  period: z.enum(["7d", "30d", "90d"]).default("30d"),
  platform: z.enum(platformValues).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export interface HashtagAnalyticsResponse {
  period: string;
  platform: string | null;
  hashtags: HashtagStat[];
  totalPosts: number;
}

// ── GET /api/analytics/hashtags ───────────────────────────────────────────────

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
      platform: request.nextUrl.searchParams.get("platform") ?? undefined,
      limit: request.nextUrl.searchParams.get("limit") ?? "30",
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { period, platform, limit } = parsed.data;
    const userId = session.user.id;

    const daysBack = period === "7d" ? 7 : period === "30d" ? 30 : 90;
    const since = new Date();
    since.setDate(since.getDate() - daysBack);

    const platformFilter = platform as Platform | undefined;

    const posts = await prisma.post.findMany({
      where: {
        userId,
        status: PostStatus.PUBLISHED,
        updatedAt: { gte: since },
        ...(platformFilter
          ? { publishResults: { some: { platform: platformFilter } } }
          : {}),
      },
      select: {
        content: true,
        publishResults: {
          ...(platformFilter ? { where: { platform: platformFilter } } : {}),
          select: {
            insights: {
              select: {
                impressions: true,
                reach: true,
                likes: true,
                comments: true,
                shares: true,
              },
            },
          },
        },
      },
    });

    const postsWithInsights = posts.map((p) => ({
      content: p.content,
      insights: p.publishResults
        .filter((pr) => pr.insights != null)
        .map((pr) => pr.insights!),
    }));

    const hashtags = computeHashtagStats(postsWithInsights, limit);

    return NextResponse.json({
      period,
      platform: platform ?? null,
      hashtags,
      totalPosts: posts.length,
    } satisfies HashtagAnalyticsResponse);
  } catch (err) {
    return handleRouteError(err);
  }
}
