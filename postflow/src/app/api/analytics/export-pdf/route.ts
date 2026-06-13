import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PublishStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { pdfExportLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-log";
import { generateAnalyticsPdf } from "@/lib/pdf-report";
import { computeScore } from "@/lib/content-score";
import { computePlatformFrequency } from "@/lib/posting-frequency";

const querySchema = z.object({
  period: z.enum(["7d", "30d", "90d"]).default("30d"),
});

const PERIOD_LABELS: Record<string, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

// ── GET /api/analytics/export-pdf ────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await pdfExportLimiter(session.user.id);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    const parsed = querySchema.safeParse({
      period: request.nextUrl.searchParams.get("period") ?? "30d",
    });
    // Fall back to 30d for invalid period (zod default handles it)
    const period = parsed.success ? parsed.data.period : "30d";

    const userId = session.user.id;
    const daysBack = period === "7d" ? 7 : period === "30d" ? 30 : 90;
    const since = new Date();
    since.setDate(since.getDate() - daysBack);

    const [postCounts, allPublishResults, topPostsRaw, connectedAccounts, recentPublishResults] =
      await Promise.all([
        prisma.post.groupBy({
          by: ["status"],
          where: { userId },
          _count: { _all: true },
        }),
        prisma.publishResult.findMany({
          where: { post: { userId } },
          select: { platform: true, status: true },
        }),
        prisma.publishResult.findMany({
          where: {
            post: { userId },
            status: PublishStatus.PUBLISHED,
            publishedAt: { gte: since },
            insights: { isNot: null },
          },
          include: {
            insights: true,
            post: { select: { content: true } },
          },
          orderBy: { publishedAt: "desc" },
          take: 100,
        }),
        prisma.socialAccount.count({ where: { userId, isActive: true } }),
        prisma.publishResult.findMany({
          where: {
            post: { userId },
            status: PublishStatus.PUBLISHED,
            publishedAt: { gte: since },
          },
          select: { platform: true, publishedAt: true },
        }),
      ]);

    // KPIs
    const countsByStatus = Object.fromEntries(
      postCounts.map((g) => [g.status, g._count._all])
    );
    const totalPosts = postCounts.reduce((s, g) => s + g._count._all, 0);
    const totalPublishResults = allPublishResults.length;
    const totalPublishedResults = allPublishResults.filter(
      (r) => r.status === PublishStatus.PUBLISHED
    ).length;
    const overallSuccessRate =
      totalPublishResults > 0
        ? Math.round((totalPublishedResults / totalPublishResults) * 100)
        : 0;

    // Platform breakdown
    const platformMap = new Map<
      string,
      { published: number; failed: number; total: number }
    >();
    for (const r of allPublishResults) {
      const entry = platformMap.get(r.platform) ?? {
        published: 0,
        failed: 0,
        total: 0,
      };
      entry.total += 1;
      if (r.status === PublishStatus.PUBLISHED) entry.published += 1;
      if (r.status === PublishStatus.FAILED) entry.failed += 1;
      platformMap.set(r.platform, entry);
    }
    const platformBreakdown = Array.from(platformMap.entries())
      .map(([platform, counts]) => ({
        platform,
        published: counts.published,
        failed: counts.failed,
        total: counts.total,
        successRate:
          counts.total > 0
            ? Math.round((counts.published / counts.total) * 100)
            : 0,
      }))
      .sort((a, b) => b.total - a.total);

    // Top posts by content score — deduplicate by content prefix
    const postScoreMap = new Map<
      string,
      {
        content: string;
        score: number;
        platforms: string[];
        publishedAt: Date | null;
      }
    >();
    for (const r of topPostsRaw) {
      if (!r.insights) continue;
      const score = computeScore(r.insights);
      if (score === 0) continue;
      const key = r.post.content.slice(0, 60);
      const existing = postScoreMap.get(key);
      if (existing) {
        existing.score += score;
        if (!existing.platforms.includes(r.platform as string)) {
          existing.platforms.push(r.platform as string);
        }
      } else {
        postScoreMap.set(key, {
          content: r.post.content,
          score,
          platforms: [r.platform as string],
          publishedAt: r.publishedAt,
        });
      }
    }
    const topPosts = Array.from(postScoreMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    // Posting frequency
    const postingFrequency = computePlatformFrequency(
      recentPublishResults.map((r) => ({ platform: r.platform as string })),
      daysBack
    ).map((pf) => ({
      platform: pf.platform,
      actualPerWeek: pf.actualPerWeek,
      recommendedPerWeek: pf.recommendedPerWeek,
      pacingStatus: pf.status,
    }));

    const pdfBuffer = await generateAnalyticsPdf({
      userEmail: session.user.email ?? "",
      period: PERIOD_LABELS[period] ?? period,
      generatedAt: new Date(),
      kpis: {
        totalPosts,
        publishedPosts: countsByStatus["PUBLISHED"] ?? 0,
        scheduledPosts: countsByStatus["SCHEDULED"] ?? 0,
        failedPosts: countsByStatus["FAILED"] ?? 0,
        draftPosts: countsByStatus["DRAFT"] ?? 0,
        overallSuccessRate,
        connectedAccounts,
      },
      platformBreakdown,
      topPosts,
      postingFrequency,
    });

    logActivity({ userId, action: "analytics.exported", metadata: { period } });

    const dateStr = new Date().toISOString().slice(0, 10);
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="postflow-report-${dateStr}-${period}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
