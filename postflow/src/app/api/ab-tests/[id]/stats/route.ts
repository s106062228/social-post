import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { computeABStats, type EngagementMetrics } from "@/lib/ab-stats";

const INSIGHTS_SELECT = {
  impressions: true,
  reach: true,
  likes: true,
  comments: true,
  shares: true,
} as const;

function sumInsights(
  publishResults: Array<{ insights: Array<{ impressions: number; reach: number; likes: number; comments: number; shares: number }> }>
): EngagementMetrics {
  let impressions = 0;
  let reach = 0;
  let likes = 0;
  let comments = 0;
  let shares = 0;
  for (const pr of publishResults) {
    for (const ins of pr.insights) {
      impressions += ins.impressions;
      reach += ins.reach;
      likes += ins.likes;
      comments += ins.comments;
      shares += ins.shares;
    }
  }
  return { impressions, reach, likes, comments, shares };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
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

    const { id } = await params;
    const test = await prisma.postABTest.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        name: true,
        winner: true,
        createdAt: true,
        postA: {
          select: {
            publishResults: {
              select: {
                insights: { select: INSIGHTS_SELECT },
              },
            },
          },
        },
        postB: {
          select: {
            publishResults: {
              select: {
                insights: { select: INSIGHTS_SELECT },
              },
            },
          },
        },
      },
    });

    if (!test) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (test.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const metricsA = sumInsights(test.postA.publishResults);
    const metricsB = sumInsights(test.postB.publishResults);
    const stats = computeABStats(metricsA, metricsB);

    return NextResponse.json({
      testId: test.id,
      name: test.name,
      winner: test.winner,
      createdAt: test.createdAt,
      stats,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
