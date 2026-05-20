import { type NextRequest, NextResponse } from "next/server";
import { PublishStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { computeScore } from "@/lib/content-score";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ComparisonPlatform {
  platform: string;
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  score: number;
}

export interface ComparisonPost {
  id: string;
  content: string;
  status: string;
  platforms: ComparisonPlatform[];
  totalScore: number;
  totalImpressions: number;
  totalReach: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
}

export interface CompareResponse {
  posts: ComparisonPost[];
  winnerId: string | null;
}

// ── GET /api/analytics/compare ────────────────────────────────────────────────

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

    const userId = session.user.id;

    // Parse postId[] query params
    const postIds = request.nextUrl.searchParams.getAll("postId[]");

    if (postIds.length < 2) {
      return NextResponse.json(
        { error: "At least 2 postIds are required" },
        { status: 400 }
      );
    }

    if (postIds.length > 5) {
      return NextResponse.json(
        { error: "At most 5 postIds are allowed" },
        { status: 400 }
      );
    }

    // Fetch posts with ownership check (userId in where clause filters out foreign posts)
    const posts = await prisma.post.findMany({
      where: { id: { in: postIds }, userId },
      select: {
        id: true,
        content: true,
        status: true,
        publishResults: {
          where: { status: PublishStatus.PUBLISHED },
          select: {
            platform: true,
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

    // Build comparison data per post
    const comparisonPosts: ComparisonPost[] = posts.map((post) => {
      const platforms: ComparisonPlatform[] = post.publishResults.map((result) => {
        const ins = result.insights;
        const impressions = ins?.impressions ?? 0;
        const reach = ins?.reach ?? 0;
        const likes = ins?.likes ?? 0;
        const comments = ins?.comments ?? 0;
        const shares = ins?.shares ?? 0;
        const score = computeScore({ impressions, reach, likes, comments, shares });

        return {
          platform: result.platform,
          impressions,
          reach,
          likes,
          comments,
          shares,
          score,
        };
      });

      const totalScore = platforms.reduce((sum, p) => sum + p.score, 0);
      const totalImpressions = platforms.reduce((sum, p) => sum + p.impressions, 0);
      const totalReach = platforms.reduce((sum, p) => sum + p.reach, 0);
      const totalLikes = platforms.reduce((sum, p) => sum + p.likes, 0);
      const totalComments = platforms.reduce((sum, p) => sum + p.comments, 0);
      const totalShares = platforms.reduce((sum, p) => sum + p.shares, 0);

      return {
        id: post.id,
        content: post.content,
        status: post.status,
        platforms,
        totalScore,
        totalImpressions,
        totalReach,
        totalLikes,
        totalComments,
        totalShares,
      };
    });

    // Determine winner: post with the highest totalScore (null if tied or no insights)
    let winnerId: string | null = null;
    if (comparisonPosts.length > 0) {
      const maxScore = Math.max(...comparisonPosts.map((p) => p.totalScore));
      if (maxScore > 0) {
        const topPosts = comparisonPosts.filter((p) => p.totalScore === maxScore);
        // Only declare a winner if there is no tie
        if (topPosts.length === 1) {
          winnerId = topPosts[0].id;
        }
      }
    }

    return NextResponse.json({
      posts: comparisonPosts,
      winnerId,
    } satisfies CompareResponse);
  } catch (err) {
    return handleRouteError(err);
  }
}
