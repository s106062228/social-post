import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import {
  analyzePostCorrelations,
  type CorrelationResult,
} from "@/lib/correlation";

const querySchema = z.object({
  period: z.enum(["30d", "90d", "all"]).default("30d"),
});

export interface CorrelationsResponse {
  period: string;
  insights: CorrelationResult[];
  totalPosts: number;
}

// ── GET /api/analytics/correlations ──────────────────────────────────────────

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

    const days = period === "30d" ? 30 : period === "90d" ? 90 : null;
    const since = days
      ? new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      : null;

    const posts = await prisma.post.findMany({
      where: {
        userId,
        status: "PUBLISHED",
        ...(since ? { updatedAt: { gte: since } } : {}),
      },
      select: {
        content: true,
        mediaType: true,
        contentCategory: true,
        publishResults: {
          where: { status: "PUBLISHED", publishedAt: { not: null } },
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

    // Flatten to one entry per publish result that has publishedAt + insights
    const flatPosts = posts.flatMap((post) =>
      post.publishResults
        .filter((pr) => pr.publishedAt !== null && pr.insights !== null)
        .map((pr) => ({
          content: post.content,
          mediaType: post.mediaType,
          contentCategory: post.contentCategory as string | null,
          publishedAt: pr.publishedAt as Date,
          totalEngagement:
            (pr.insights?.likes ?? 0) +
            (pr.insights?.comments ?? 0) +
            (pr.insights?.shares ?? 0),
        }))
    );

    const insights = analyzePostCorrelations(flatPosts);

    return NextResponse.json({
      period,
      insights,
      totalPosts: flatPosts.length,
    } satisfies CorrelationsResponse);
  } catch (err) {
    return handleRouteError(err);
  }
}
