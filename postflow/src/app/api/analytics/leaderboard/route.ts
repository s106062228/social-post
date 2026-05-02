import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PublishStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { computeScore } from "@/lib/content-score";

const querySchema = z.object({
  period: z.enum(["7d", "30d", "90d", "all"]).default("30d"),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ── GET /api/analytics/leaderboard ───────────────────────────────────────────

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

    let publishedSince: Date | undefined;
    if (period !== "all") {
      const daysBack = period === "7d" ? 7 : period === "30d" ? 30 : 90;
      publishedSince = new Date();
      publishedSince.setDate(publishedSince.getDate() - daysBack);
    }

    // Fetch all PUBLISHED results with insights for this user
    const results = await prisma.publishResult.findMany({
      where: {
        post: { userId },
        status: PublishStatus.PUBLISHED,
        ...(publishedSince ? { publishedAt: { gte: publishedSince } } : {}),
        insights: { isNot: null },
      },
      select: {
        postId: true,
        platform: true,
        publishedUrl: true,
        publishedAt: true,
        insights: {
          select: {
            impressions: true,
            reach: true,
            likes: true,
            comments: true,
            shares: true,
            syncedAt: true,
          },
        },
        post: {
          select: {
            id: true,
            content: true,
            mediaType: true,
            status: true,
            scheduledAt: true,
            createdAt: true,
          },
        },
      },
      orderBy: { publishedAt: "desc" },
    });

    // Group by postId and aggregate scores
    const postMap = new Map<
      string,
      {
        post: (typeof results)[0]["post"];
        platforms: Array<{
          platform: string;
          publishedUrl: string | null;
          publishedAt: Date | null;
          score: number;
          insights: NonNullable<(typeof results)[0]["insights"]>;
        }>;
        totalScore: number;
        totals: {
          impressions: number;
          reach: number;
          likes: number;
          comments: number;
          shares: number;
        };
      }
    >();

    for (const r of results) {
      if (!r.insights) continue;

      const score = computeScore(r.insights);
      const existing = postMap.get(r.postId);

      if (!existing) {
        postMap.set(r.postId, {
          post: r.post,
          platforms: [
            {
              platform: r.platform,
              publishedUrl: r.publishedUrl,
              publishedAt: r.publishedAt,
              score,
              insights: r.insights,
            },
          ],
          totalScore: score,
          totals: {
            impressions: r.insights.impressions ?? 0,
            reach: r.insights.reach ?? 0,
            likes: r.insights.likes ?? 0,
            comments: r.insights.comments ?? 0,
            shares: r.insights.shares ?? 0,
          },
        });
      } else {
        existing.platforms.push({
          platform: r.platform,
          publishedUrl: r.publishedUrl,
          publishedAt: r.publishedAt,
          score,
          insights: r.insights,
        });
        existing.totalScore += score;
        existing.totals.impressions += r.insights.impressions ?? 0;
        existing.totals.reach += r.insights.reach ?? 0;
        existing.totals.likes += r.insights.likes ?? 0;
        existing.totals.comments += r.insights.comments ?? 0;
        existing.totals.shares += r.insights.shares ?? 0;
      }
    }

    // Sort by totalScore descending and take top N
    const ranked = Array.from(postMap.values())
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, limit)
      .map((entry, index) => ({
        rank: index + 1,
        postId: entry.post.id,
        contentPreview: entry.post.content.slice(0, 120),
        mediaType: entry.post.mediaType,
        createdAt: entry.post.createdAt,
        totalScore: Math.round(entry.totalScore),
        totals: entry.totals,
        platforms: entry.platforms.map((p) => ({
          platform: p.platform,
          publishedUrl: p.publishedUrl,
          publishedAt: p.publishedAt,
          score: Math.round(p.score),
        })),
      }));

    return NextResponse.json({ period, limit, ranked });
  } catch (err) {
    return handleRouteError(err);
  }
}
