import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PublishStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import {
  computeSeasonalPatterns,
  type SeasonalPatternsResult,
} from "@/lib/seasonal-patterns";

const querySchema = z.object({
  lookbackYears: z.coerce.number().int().min(1).max(3).default(2),
});

export interface SeasonalPatternsResponse extends SeasonalPatternsResult {
  lookbackYears: number;
}

// ── GET /api/analytics/seasonal-patterns ──────────────────────────────────────

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
      lookbackYears: request.nextUrl.searchParams.get("lookbackYears") ?? "2",
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { lookbackYears } = parsed.data;
    const userId = session.user.id;

    const since = new Date(
      Date.now() - lookbackYears * 365 * 24 * 60 * 60 * 1000
    );

    const posts = await prisma.post.findMany({
      where: { userId, status: "PUBLISHED", updatedAt: { gte: since } },
      select: {
        id: true,
        content: true,
        publishResults: {
          where: { status: PublishStatus.PUBLISHED },
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

    // Flatten to per-publish-result with engagement aggregated across insights
    const postInputs: {
      id: string;
      content: string;
      engagement: number;
      publishedAt: Date;
    }[] = [];

    for (const post of posts) {
      for (const result of post.publishResults) {
        if (!result.publishedAt) continue;
        const engagement = result.insights.reduce(
          (sum: number, ins: { likes: number | null; comments: number | null; shares: number | null }) =>
            sum + (ins.likes ?? 0) + (ins.comments ?? 0) + (ins.shares ?? 0),
          0
        );
        // De-duplicate per post (use most recent published result)
        const existing = postInputs.find((p) => p.id === post.id);
        if (!existing) {
          postInputs.push({
            id: post.id,
            content: post.content,
            engagement,
            publishedAt: result.publishedAt,
          });
        } else if (result.publishedAt > existing.publishedAt) {
          existing.engagement = engagement;
          existing.publishedAt = result.publishedAt;
        }
      }
    }

    const result = computeSeasonalPatterns(postInputs);

    return NextResponse.json({
      lookbackYears,
      ...result,
    } satisfies SeasonalPatternsResponse);
  } catch (err) {
    return handleRouteError(err);
  }
}
