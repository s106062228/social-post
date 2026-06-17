import { type NextRequest, NextResponse as NR } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import {
  detectEngagementAnomalies,
  type AnomalyDetectionResult,
  type PostForAnomaly,
} from "@/lib/anomaly-detection";

const VALID_PERIODS = ["7d", "30d", "90d", "all"] as const;
type Period = (typeof VALID_PERIODS)[number];

export interface AnomaliesResponse extends AnomalyDetectionResult {
  period: string;
}

export async function GET(req: NextRequest): Promise<NR> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NR.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await apiLimiter(session.user.id);
    if (!rl.success) {
      return NR.json(
        { error: "Too many requests" },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    const { searchParams } = new URL(req.url);
    const rawPeriod = searchParams.get("period") ?? "30d";

    if (!VALID_PERIODS.includes(rawPeriod as Period)) {
      return NR.json({ error: "Invalid period. Use 7d, 30d, 90d, or all." }, { status: 400 });
    }

    const period = rawPeriod as Period;
    const days =
      period === "all"
        ? undefined
        : period === "7d"
        ? 7
        : period === "30d"
        ? 30
        : 90;

    const since = days
      ? new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      : undefined;

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
            publishedAt: true,
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
    });

    // Flatten to one row per (post × platform × insight)
    const postsForDetection: PostForAnomaly[] = [];
    for (const post of posts) {
      for (const result of post.publishResults) {
        for (const insight of result.insights) {
          postsForDetection.push({
            postId: post.id,
            content: post.content,
            platform: result.platform,
            publishedAt: result.publishedAt,
            insights: {
              likes: insight.likes,
              comments: insight.comments,
              shares: insight.shares,
              reach: insight.reach,
              impressions: insight.impressions,
            },
          });
        }
      }
    }

    const result = detectEngagementAnomalies(postsForDetection);

    return NR.json({
      period,
      ...result,
    } satisfies AnomaliesResponse);
  } catch (err) {
    return handleRouteError(err);
  }
}
