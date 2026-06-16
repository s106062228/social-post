import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PublishStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import {
  computeEvergreenScore,
  type EvergreenCandidate,
} from "@/lib/evergreen-score";

export type { EvergreenCandidate };

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  minScore: z.coerce.number().int().min(0).max(100).default(40),
});

export interface EvergreenCandidatesResponse {
  candidates: EvergreenCandidate[];
  totalAnalyzed: number;
  avgScore: number;
}

// ── GET /api/analytics/evergreen-candidates ───────────────────────────────────

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
      limit: request.nextUrl.searchParams.get("limit") ?? "20",
      minScore: request.nextUrl.searchParams.get("minScore") ?? "40",
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { limit, minScore } = parsed.data;
    const userId = session.user.id;

    // Fetch PUBLISHED, non-evergreen posts that have at least one insights record
    const posts = await prisma.post.findMany({
      where: {
        userId,
        status: "PUBLISHED",
        isEvergreen: false,
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
        isEvergreen: true,
        publishResults: {
          where: {
            status: PublishStatus.PUBLISHED,
            insights: { isNot: null },
          },
          select: {
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
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    // Filter to posts with at least one insights record; aggregate insights across platforms
    const postsWithInsights = posts.filter(
      (p) => p.publishResults.some((pr) => pr.insights !== null)
    );

    const candidates = postsWithInsights
      .map((post) => {
        // Aggregate insights across all publish results
        const aggregated = post.publishResults.reduce(
          (acc, pr) => {
            const ins = pr.insights;
            if (!ins) return acc;
            return {
              likes: acc.likes + (ins.likes ?? 0),
              comments: acc.comments + (ins.comments ?? 0),
              shares: acc.shares + (ins.shares ?? 0),
              reach: acc.reach + (ins.reach ?? 0),
              impressions: acc.impressions + (ins.impressions ?? 0),
            };
          },
          { likes: 0, comments: 0, shares: 0, reach: 0, impressions: 0 }
        );

        return computeEvergreenScore({
          id: post.id,
          content: post.content,
          publishedAt: null,
          createdAt: post.createdAt,
          isEvergreen: post.isEvergreen,
          insights: aggregated,
        });
      })
      .filter((c) => c.score >= minScore)
      .sort((a, b) => b.score - a.score);

    const limited = candidates.slice(0, limit);
    const avgScore =
      candidates.length > 0
        ? Math.round(
            candidates.reduce((sum, c) => sum + c.score, 0) / candidates.length
          )
        : 0;

    return NextResponse.json({
      candidates: limited,
      totalAnalyzed: postsWithInsights.length,
      avgScore,
    } satisfies EvergreenCandidatesResponse);
  } catch (err) {
    return handleRouteError(err);
  }
}
