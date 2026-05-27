import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PostStatus, PublishStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const querySchema = z.object({
  period: z.enum(["30d", "90d", "all"]).default("30d"),
});

export interface MatrixCell {
  platform: string;
  category: string;
  avgEngagement: number;
  postCount: number;
}

export interface PerformanceMatrixResponse {
  period: string;
  matrix: MatrixCell[];
  platforms: string[];
  categories: string[];
}

// ── GET /api/analytics/performance-matrix ────────────────────────────────────

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

    const since =
      period === "all"
        ? undefined
        : (() => {
            const d = new Date();
            const days = period === "30d" ? 30 : 90;
            d.setDate(d.getDate() - days);
            return d;
          })();

    // Fetch PUBLISHED posts with contentCategory and their publish results + insights
    const posts = await prisma.post.findMany({
      where: {
        userId,
        status: PostStatus.PUBLISHED,
        ...(since ? { updatedAt: { gte: since } } : {}),
      },
      select: {
        contentCategory: true,
        publishResults: {
          where: { status: PublishStatus.PUBLISHED },
          select: {
            platform: true,
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

    // Build a map: `${platform}:${category}` → { total: number, count: number }
    type Key = `${string}:${string}`;
    const map = new Map<Key, { totalEngagement: number; insightCount: number; postCount: number }>();

    const platformSet = new Set<string>();
    const categorySet = new Set<string>();

    for (const post of posts) {
      const category = post.contentCategory ?? "UNCATEGORIZED";
      categorySet.add(category);

      for (const pr of post.publishResults) {
        const platform = pr.platform as string;
        platformSet.add(platform);

        const key: Key = `${platform}:${category}`;
        const entry = map.get(key) ?? { totalEngagement: 0, insightCount: 0, postCount: 0 };

        entry.postCount += 1;

        if (pr.insights) {
          entry.totalEngagement +=
            (pr.insights.likes ?? 0) +
            (pr.insights.comments ?? 0) +
            (pr.insights.shares ?? 0);
          entry.insightCount += 1;
        }

        map.set(key, entry);
      }
    }

    const platforms = Array.from(platformSet).sort();
    const categories = Array.from(categorySet).sort();

    // Build the matrix cells (only cells with data)
    const matrix: MatrixCell[] = [];
    for (const [key, entry] of map.entries()) {
      const colonIdx = key.indexOf(":");
      const platform = key.slice(0, colonIdx);
      const category = key.slice(colonIdx + 1);

      matrix.push({
        platform,
        category,
        avgEngagement:
          entry.insightCount > 0
            ? Math.round((entry.totalEngagement / entry.insightCount) * 10) / 10
            : 0,
        postCount: entry.postCount,
      });
    }

    // Sort by avgEngagement descending for consistent ordering
    matrix.sort((a, b) => b.avgEngagement - a.avgEngagement);

    return NextResponse.json({
      period,
      matrix,
      platforms,
      categories,
    } satisfies PerformanceMatrixResponse);
  } catch (err) {
    return handleRouteError(err);
  }
}
