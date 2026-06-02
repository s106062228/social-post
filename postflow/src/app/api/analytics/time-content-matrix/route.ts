import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Platform, PostStatus, PublishStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const querySchema = z.object({
  period: z.enum(["7d", "30d", "90d", "all"]).default("30d"),
  platform: z.nativeEnum(Platform).optional(),
});

export interface TimeContentMatrixCell {
  hour: number;
  category: string;
  avgEngagement: number;
  postCount: number;
}

export interface TimeContentRecommendation {
  category: string;
  optimalHour: number;
  optimalHourLabel: string;
  avgEngagement: number;
}

export interface TimeContentMatrixResponse {
  period: string;
  matrix: TimeContentMatrixCell[];
  categories: string[];
  totalDataPoints: number;
  recommendations: TimeContentRecommendation[];
}

const PERIOD_DAYS: Record<string, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export function formatHourLabel(h: number): string {
  if (h === 0) return "12am";
  if (h < 12) return `${h}am`;
  if (h === 12) return "12pm";
  return `${h - 12}pm`;
}

// ── GET /api/analytics/time-content-matrix ────────────────────────────────────

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
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { period, platform } = parsed.data;
    const userId = session.user.id;

    const since =
      period === "all"
        ? undefined
        : new Date(Date.now() - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000);

    // Fetch PUBLISHED posts with contentCategory, joined to publishResults with insights
    const posts = await prisma.post.findMany({
      where: {
        userId,
        status: PostStatus.PUBLISHED,
        ...(since ? { updatedAt: { gte: since } } : {}),
      },
      select: {
        contentCategory: true,
        publishResults: {
          where: {
            status: PublishStatus.PUBLISHED,
            publishedAt: { not: null },
            ...(platform ? { platform } : {}),
          },
          select: {
            publishedAt: true,
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

    // Build a map: `${hour}:${category}` → { totalEngagement, insightCount, postCount }
    type Key = `${number}:${string}`;
    const map = new Map<Key, { totalEngagement: number; insightCount: number; postCount: number }>();
    const categorySet = new Set<string>();

    for (const post of posts) {
      const category = post.contentCategory ?? "UNCATEGORIZED";
      categorySet.add(category);

      for (const pr of post.publishResults) {
        if (!pr.publishedAt) continue;

        const hour = new Date(pr.publishedAt).getUTCHours();
        const key: Key = `${hour}:${category}`;

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

    const categories = Array.from(categorySet).sort();

    // Build matrix cells (only cells with data)
    const matrix: TimeContentMatrixCell[] = [];
    for (const [key, entry] of map.entries()) {
      const colonIdx = key.indexOf(":");
      const hour = parseInt(key.slice(0, colonIdx), 10);
      const category = key.slice(colonIdx + 1);

      matrix.push({
        hour,
        category,
        avgEngagement:
          entry.insightCount > 0
            ? Math.round((entry.totalEngagement / entry.insightCount) * 10) / 10
            : 0,
        postCount: entry.postCount,
      });
    }

    // Sort by category then hour for consistent ordering
    matrix.sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return a.hour - b.hour;
    });

    // Build recommendations: for each category, find the hour with highest avgEngagement
    const catBestHour = new Map<string, { hour: number; avgEngagement: number }>();
    for (const cell of matrix) {
      const existing = catBestHour.get(cell.category);
      if (!existing || cell.avgEngagement > existing.avgEngagement) {
        catBestHour.set(cell.category, { hour: cell.hour, avgEngagement: cell.avgEngagement });
      }
    }

    const recommendations: TimeContentRecommendation[] = Array.from(catBestHour.entries())
      .map(([category, { hour, avgEngagement }]) => ({
        category,
        optimalHour: hour,
        optimalHourLabel: formatHourLabel(hour),
        avgEngagement,
      }))
      .sort((a, b) => b.avgEngagement - a.avgEngagement);

    const totalDataPoints = matrix.reduce((sum, c) => sum + c.postCount, 0);

    return NextResponse.json({
      period,
      matrix,
      categories,
      totalDataPoints,
      recommendations,
    } satisfies TimeContentMatrixResponse);
  } catch (err) {
    return handleRouteError(err);
  }
}
