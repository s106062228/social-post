import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PostStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const querySchema = z.object({
  period: z.enum(["7d", "30d", "90d"]).default("30d"),
});

export interface ContentMixCategory {
  category: string;
  count: number;
  percentage: number;
  avgEngagement: number;
}

export interface ContentMixResponse {
  period: string;
  total: number;
  categories: ContentMixCategory[];
}

// ── GET /api/analytics/content-mix ───────────────────────────────────────────

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

    const daysBack = period === "7d" ? 7 : period === "30d" ? 30 : 90;
    const since = new Date();
    since.setDate(since.getDate() - daysBack);

    const posts = await prisma.post.findMany({
      where: {
        userId,
        status: PostStatus.PUBLISHED,
        updatedAt: { gte: since },
      },
      select: {
        contentCategory: true,
        publishResults: {
          select: {
            insights: {
              select: {
                likes: true,
                comments: true,
                shares: true,
              },
            },
          },
        },
      },
    });

    const total = posts.length;

    // Group by category; null → "UNCATEGORIZED"
    const map = new Map<
      string,
      { count: number; totalEngagement: number; insightCount: number }
    >();

    for (const post of posts) {
      const key = post.contentCategory ?? "UNCATEGORIZED";
      const entry = map.get(key) ?? { count: 0, totalEngagement: 0, insightCount: 0 };
      entry.count += 1;

      // Sum engagement from all publish results
      for (const pr of post.publishResults) {
        if (pr.insights != null) {
          entry.totalEngagement +=
            (pr.insights.likes ?? 0) +
            (pr.insights.comments ?? 0) +
            (pr.insights.shares ?? 0);
          entry.insightCount += 1;
        }
      }

      map.set(key, entry);
    }

    const categories: ContentMixCategory[] = Array.from(map.entries())
      .map(([category, { count, totalEngagement, insightCount }]) => ({
        category,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
        avgEngagement:
          insightCount > 0
            ? Math.round((totalEngagement / insightCount) * 10) / 10
            : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      period,
      total,
      categories,
    } satisfies ContentMixResponse);
  } catch (err) {
    return handleRouteError(err);
  }
}
