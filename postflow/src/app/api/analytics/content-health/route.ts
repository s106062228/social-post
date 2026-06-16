import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PostStatus, PublishStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { computeConsistency } from "@/lib/consistency";
import { computeContentHealth, type ContentHealthResult } from "@/lib/content-health";

const querySchema = z.object({
  period: z.enum(["30d", "90d"]).default("30d"),
});

export interface ContentHealthResponse extends ContentHealthResult {
  period: string;
}

// ── GET /api/analytics/content-health ────────────────────────────────────────

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
    const periodDays = period === "30d" ? 30 : 90;

    const now = new Date();
    const currentStart = new Date(now);
    currentStart.setDate(currentStart.getDate() - periodDays);
    currentStart.setHours(0, 0, 0, 0);

    const priorStart = new Date(currentStart);
    priorStart.setDate(priorStart.getDate() - periodDays);

    // ── 1. Distinct content categories in current period ───────────────────
    const currentPosts = await prisma.post.findMany({
      where: {
        userId,
        status: PostStatus.PUBLISHED,
        updatedAt: { gte: currentStart },
      },
      select: {
        contentCategory: true,
        archivedAt: true,
        updatedAt: true,
        publishResults: {
          where: { status: PublishStatus.PUBLISHED },
          select: {
            accountId: true,
            insights: {
              select: { likes: true, comments: true, shares: true },
            },
          },
        },
      },
    });

    // Filter out archived posts
    const activePosts = currentPosts.filter((p) => p.archivedAt == null);

    const distinctCategories = new Set(
      activePosts
        .map((p) => p.contentCategory)
        .filter((c): c is NonNullable<typeof c> => c != null)
    ).size;

    const totalPosts = activePosts.length;

    // ── 2. Platform coverage ───────────────────────────────────────────────
    const [activeAccounts, accountsPostedToSet] = await Promise.all([
      prisma.socialAccount.count({ where: { userId, isActive: true } }),
      // distinct accounts that received a PUBLISHED result in the period
      (async () => {
        const results = await prisma.publishResult.findMany({
          where: {
            post: { userId },
            status: PublishStatus.PUBLISHED,
            publishedAt: { gte: currentStart },
          },
          select: { accountId: true },
          distinct: ["accountId"],
        });
        return new Set(results.map((r) => r.accountId));
      })(),
    ]);

    const accountsPostedTo = accountsPostedToSet.size;

    // ── 3. Regularity (consistency score) ────────────────────────────────
    const postDates = activePosts.map((p) => p.updatedAt);
    const { score: consistencyScore } = computeConsistency(postDates, periodDays);

    // ── 4. Engagement trend ───────────────────────────────────────────────
    type PostWithInsights = { publishResults: { insights: { likes: number | null; comments: number | null; shares: number | null } | null }[] };
    const engagementSum = (posts: PostWithInsights[]): number => {
      let total = 0;
      let count = 0;
      for (const post of posts) {
        for (const pr of post.publishResults) {
          if (pr.insights) {
            total +=
              (pr.insights.likes ?? 0) +
              (pr.insights.comments ?? 0) +
              (pr.insights.shares ?? 0);
            count += 1;
          }
        }
      }
      return count > 0 ? total / count : 0;
    };

    const currentEngagement = engagementSum(activePosts);

    const priorPosts = await prisma.post.findMany({
      where: {
        userId,
        status: PostStatus.PUBLISHED,
        updatedAt: { gte: priorStart, lt: currentStart },
        archivedAt: null,
      },
      select: {
        publishResults: {
          where: { status: PublishStatus.PUBLISHED },
          select: {
            insights: {
              select: { likes: true, comments: true, shares: true },
            },
          },
        },
      },
    });

    const priorEngagement = priorPosts.length > 0 ? engagementSum(priorPosts) : null;

    // ── 5. Freshness (recycled posts) ─────────────────────────────────────
    // Recycled posts have archivedAt == null AND were created via the recycle
    // flow — they share content with an older PUBLISHED post. We approximate
    // by checking posts whose content exactly duplicates another post in DB.
    // Simpler approach: count posts in the period where isEvergreen=true AND
    // they came from a recycle (we can't directly detect; use lastRecycledAt).
    // Best proxy available: count of posts that were recycled this period.
    const recycledPostsCount = await prisma.post.count({
      where: {
        userId,
        status: PostStatus.PUBLISHED,
        updatedAt: { gte: currentStart },
        archivedAt: null,
        // Posts created by the recycle endpoint are DRAFT then get published.
        // We approximate freshness as any post whose content duplicates an older
        // post. For simplicity, count posts in the period where isEvergreen=true,
        // which is the most common trigger for recycling.
        isEvergreen: true,
      },
    });

    const result = computeContentHealth({
      distinctCategories,
      totalPosts,
      activeAccounts,
      accountsPostedTo,
      consistencyScore,
      currentEngagement,
      priorEngagement,
      recycledPosts: recycledPostsCount,
    });

    return NextResponse.json({
      ...result,
      period,
    } satisfies ContentHealthResponse);
  } catch (err) {
    return handleRouteError(err);
  }
}
