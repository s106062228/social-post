import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { explainPostPerformance, type InsightsSummary } from "@/lib/ai";

const postIdSchema = z.string().cuid();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await apiLimiter(req, session.user.id);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    const { id: postId } = await params;
    const parsed = postIdSchema.safeParse(postId);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid post ID" }, { status: 400 });
    }

    const post = await prisma.post.findFirst({
      where: { id: postId, userId: session.user.id },
      include: {
        publishResults: {
          include: { insights: true },
        },
      },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Aggregate insights across all published results
    const allInsights = post.publishResults.flatMap((r) => r.insights);
    if (allInsights.length === 0) {
      return NextResponse.json(
        { error: "No published insights available for this post. Sync insights first." },
        { status: 422 }
      );
    }

    const aggregated: InsightsSummary = allInsights.reduce(
      (acc, ins) => ({
        impressions: acc.impressions + (ins.impressions ?? 0),
        reach: acc.reach + (ins.reach ?? 0),
        likes: acc.likes + (ins.likes ?? 0),
        comments: acc.comments + (ins.comments ?? 0),
        shares: acc.shares + (ins.shares ?? 0),
      }),
      { impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0 }
    );

    // Compute historical averages for context
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const historicalAvgRaw = await prisma.postInsights.aggregate({
      where: {
        publishResult: {
          status: "PUBLISHED",
          post: { userId: session.user.id, status: "PUBLISHED" },
        },
        syncedAt: { gte: thirtyDaysAgo },
      },
      _avg: {
        impressions: true,
        reach: true,
        likes: true,
        comments: true,
        shares: true,
      },
    });

    const historicalAvg = historicalAvgRaw._avg.impressions != null
      ? {
          impressions: historicalAvgRaw._avg.impressions ?? 0,
          reach: historicalAvgRaw._avg.reach ?? 0,
          likes: historicalAvgRaw._avg.likes ?? 0,
          comments: historicalAvgRaw._avg.comments ?? 0,
          shares: historicalAvgRaw._avg.shares ?? 0,
        }
      : null;

    // Determine primary platform
    const primaryPlatform = post.publishResults[0]?.platform ?? null;

    const result = await explainPostPerformance(
      post.content,
      aggregated,
      historicalAvg,
      primaryPlatform as string | null
    );

    if (!result) {
      return NextResponse.json(
        { error: "AI not configured or unavailable" },
        { status: 503 }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
