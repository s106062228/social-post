import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import {
  detectContentFatigue,
  type ContentFatigueResult,
} from "@/lib/content-fatigue";

const querySchema = z.object({
  platform: z.string().optional(),
});

export type ContentFatigueResponse = ContentFatigueResult;

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limited = await apiLimiter(session.user.id);
    if (limited) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: rateLimitHeaders(limited) }
      );
    }

    const params = querySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams)
    );
    if (!params.success) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    const { platform } = params.data;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const posts = await prisma.post.findMany({
      where: {
        userId: session.user.id,
        publishResults: {
          some: {
            status: "PUBLISHED",
            publishedAt: { gte: thirtyDaysAgo },
          },
        },
      },
      select: {
        publishResults: {
          where: {
            publishedAt: { gte: thirtyDaysAgo },
          },
          select: {
            platform: true,
            status: true,
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

    const mappedPosts = posts.map((post) => ({
      publishResults: post.publishResults.map((r) => ({
        platform: r.platform as string,
        status: r.status as string,
        publishedAt: r.publishedAt,
        insights: r.insights
          ? {
              likes: r.insights.likes ?? 0,
              comments: r.insights.comments ?? 0,
              shares: r.insights.shares ?? 0,
              reach: r.insights.reach ?? 0,
              impressions: r.insights.impressions ?? 0,
            }
          : null,
      })),
    }));

    const result = detectContentFatigue(mappedPosts, platform);

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
