import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const PERIODS = ["7d", "30d", "90d", "all"] as const;
type Period = (typeof PERIODS)[number];

function periodToDays(period: Period): number | null {
  if (period === "all") return null;
  return parseInt(period, 10);
}

const querySchema = z.object({
  period: z.enum(PERIODS).default("30d"),
});

export interface PlatformDepthMetrics {
  platform: string;
  avgCommentRate: number;
  avgShareRate: number;
  postCount: number;
}

export interface TopDeepPost {
  postId: string;
  content: string;
  platform: string;
  commentRate: number;
  shareRate: number;
  comments: number;
  shares: number;
  impressions: number;
}

export interface EngagementDepthResponse {
  period: Period;
  avgCommentRate: number;
  avgShareRate: number;
  avgEngagementDepthScore: number;
  platformMetrics: PlatformDepthMetrics[];
  topDeepEngagementPosts: TopDeepPost[];
  totalAnalyzed: number;
}

function computeDepthScore(comments: number, shares: number, impressions: number): number {
  if (impressions === 0) return 0;
  const weightedEngagement = comments * 5 + shares * 4;
  const maxPossible = impressions * 9;
  return Math.min(100, Math.round((weightedEngagement / maxPossible) * 100 * 100));
}

export async function GET(req: NextRequest): Promise<NextResponse> {
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
      period: req.nextUrl.searchParams.get("period") ?? "30d",
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }

    const { period } = parsed.data;
    const days = periodToDays(period);
    const since = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : undefined;

    const posts = await prisma.post.findMany({
      where: {
        userId: session.user.id,
        status: "PUBLISHED",
        ...(since ? { updatedAt: { gte: since } } : {}),
      },
      select: {
        id: true,
        content: true,
        publishResults: {
          where: { status: "PUBLISHED" },
          select: {
            platform: true,
            insights: {
              select: {
                impressions: true,
                comments: true,
                shares: true,
                likes: true,
                reach: true,
              },
            },
          },
        },
      },
    });

    type InsightRow = {
      impressions: number;
      comments: number;
      shares: number;
      likes: number;
      reach: number;
    };

    type ResultRow = {
      platform: string;
      insights: InsightRow[];
    };

    type PostRow = {
      id: string;
      content: string;
      publishResults: ResultRow[];
    };

    // Build flat list of (post, platform, insight) tuples
    const rows: { postId: string; content: string; platform: string; insight: InsightRow }[] = [];
    for (const post of posts as PostRow[]) {
      for (const result of post.publishResults) {
        for (const insight of result.insights) {
          rows.push({
            postId: post.id,
            content: post.content,
            platform: result.platform,
            insight,
          });
        }
      }
    }

    if (rows.length === 0) {
      const empty: EngagementDepthResponse = {
        period,
        avgCommentRate: 0,
        avgShareRate: 0,
        avgEngagementDepthScore: 0,
        platformMetrics: [],
        topDeepEngagementPosts: [],
        totalAnalyzed: 0,
      };
      return NextResponse.json(empty);
    }

    // Compute per-row metrics (skip 0-impression rows for rates)
    const validRows = rows.filter((r) => r.insight.impressions > 0);
    const totalAnalyzed = validRows.length;

    const commentRates = validRows.map((r) => (r.insight.comments / r.insight.impressions) * 100);
    const shareRates = validRows.map((r) => (r.insight.shares / r.insight.impressions) * 100);
    const depthScores = validRows.map((r) =>
      computeDepthScore(r.insight.comments, r.insight.shares, r.insight.impressions)
    );

    const avgCommentRate =
      totalAnalyzed > 0
        ? Math.round((commentRates.reduce((s, v) => s + v, 0) / totalAnalyzed) * 100) / 100
        : 0;
    const avgShareRate =
      totalAnalyzed > 0
        ? Math.round((shareRates.reduce((s, v) => s + v, 0) / totalAnalyzed) * 100) / 100
        : 0;
    const avgEngagementDepthScore =
      totalAnalyzed > 0
        ? Math.round(depthScores.reduce((s, v) => s + v, 0) / totalAnalyzed)
        : 0;

    // Per-platform aggregation
    const platformMap = new Map<string, { commentRateSum: number; shareRateSum: number; count: number }>();
    for (let i = 0; i < validRows.length; i++) {
      const { platform } = validRows[i];
      const existing = platformMap.get(platform) ?? { commentRateSum: 0, shareRateSum: 0, count: 0 };
      existing.commentRateSum += commentRates[i];
      existing.shareRateSum += shareRates[i];
      existing.count++;
      platformMap.set(platform, existing);
    }

    const platformMetrics: PlatformDepthMetrics[] = Array.from(platformMap.entries())
      .map(([platform, agg]) => ({
        platform,
        avgCommentRate: Math.round((agg.commentRateSum / agg.count) * 100) / 100,
        avgShareRate: Math.round((agg.shareRateSum / agg.count) * 100) / 100,
        postCount: agg.count,
      }))
      .sort((a, b) => b.avgCommentRate - a.avgCommentRate);

    // Top deep engagement posts (by commentRate)
    const topDeepEngagementPosts: TopDeepPost[] = validRows
      .map((r, i) => ({
        postId: r.postId,
        content: r.content.slice(0, 80),
        platform: r.platform,
        commentRate: Math.round(commentRates[i] * 100) / 100,
        shareRate: Math.round(shareRates[i] * 100) / 100,
        comments: r.insight.comments,
        shares: r.insight.shares,
        impressions: r.insight.impressions,
      }))
      .sort((a, b) => b.commentRate - a.commentRate)
      .slice(0, 10);

    const response: EngagementDepthResponse = {
      period,
      avgCommentRate,
      avgShareRate,
      avgEngagementDepthScore,
      platformMetrics,
      topDeepEngagementPosts,
      totalAnalyzed,
    };

    return NextResponse.json(response);
  } catch (err) {
    return handleRouteError(err);
  }
}
