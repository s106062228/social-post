import { type NextRequest, NextResponse } from "next/server";
import { PostStatus, PublishStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { computeConsistency } from "@/lib/consistency";
import { computePlatformFrequency } from "@/lib/posting-frequency";
import { computeBenchmarkComparisons } from "@/lib/engagement-benchmarks";
import { computeScore } from "@/lib/content-score";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuditReportData {
  id: string;
  period: string;
  generatedAt: string;
  overallScore: number;
  overallGrade: string;
  accountHealth: unknown;
  contentMix: unknown;
  postingPatterns: unknown;
  engagementBenchmarks: unknown;
  consistencyScore: unknown;
  topContent: unknown;
  recommendations: string[];
}

export interface AuditListResponse {
  reports: Array<{
    id: string;
    period: string;
    generatedAt: string;
    overallScore: number;
  }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function gradeFromScore(score: number): string {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  if (score >= 50) return "D";
  return "F";
}

function buildRecommendations(data: {
  overallScore: number;
  accounts: number;
  postsPublished30d: number;
  consistencyScore: number;
  avgEngagementRate: number;
  aboveBenchmarkCount: number;
  totalBenchmarkPlatforms: number;
}): string[] {
  const recs: string[] = [];

  if (data.accounts === 0) {
    recs.push("Connect at least one social media account to start publishing.");
  }

  if (data.postsPublished30d === 0) {
    recs.push(
      "You haven't published any posts in the last 30 days. Start posting consistently to build your audience."
    );
  } else if (data.postsPublished30d < 4) {
    recs.push(
      "Try to publish at least 4 posts per month to maintain audience engagement."
    );
  }

  if (data.consistencyScore < 50) {
    recs.push(
      "Your posting consistency score is low. Set up recurring schedules or use the Queue feature to stay on track."
    );
  } else if (data.consistencyScore < 70) {
    recs.push(
      "Improve posting consistency by scheduling content in advance using the calendar or queue features."
    );
  }

  if (data.avgEngagementRate < 0.5) {
    recs.push(
      "Your engagement rate is below average. Try using more engaging content formats like questions, polls, or behind-the-scenes content."
    );
  } else if (data.avgEngagementRate < 1.5) {
    recs.push(
      "Boost engagement by responding to comments promptly and using the inbox feature to manage replies."
    );
  }

  if (
    data.totalBenchmarkPlatforms > 0 &&
    data.aboveBenchmarkCount === 0
  ) {
    recs.push(
      "Your engagement rates are below industry benchmarks on all platforms. Review your content strategy and optimal posting times."
    );
  } else if (data.aboveBenchmarkCount < data.totalBenchmarkPlatforms) {
    recs.push(
      "Some platforms are below industry benchmarks. Check the Analytics → Benchmarks section to identify improvement areas."
    );
  }

  if (recs.length === 0) {
    recs.push(
      "Great work! Keep posting consistently and engaging with your audience to maintain high performance."
    );
    recs.push(
      "Consider using the A/B Testing feature to experiment with different content formats and find what resonates best."
    );
  }

  if (recs.length < 3) {
    recs.push(
      "Use the Content Calendar Planner (AI Plan button) to generate a content strategy for the upcoming weeks."
    );
  }

  return recs.slice(0, 5);
}

// ── POST /api/analytics/audit ─────────────────────────────────────────────────

export async function POST(_request: NextRequest): Promise<NextResponse> {
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
    const period = "30d";
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // ── 1. Account Health ─────────────────────────────────────────────────────

    const accounts = await prisma.socialAccount.findMany({
      where: { userId },
      select: {
        id: true,
        accountName: true,
        platform: true,
        isActive: true,
        audienceMetrics: {
          select: { followersCount: true, syncedAt: true },
          orderBy: { syncedAt: "desc" },
          take: 2,
        },
      },
    });

    const publishResults30d = await prisma.publishResult.findMany({
      where: {
        post: { userId },
        status: PublishStatus.PUBLISHED,
        publishedAt: { gte: thirtyDaysAgo },
      },
      select: {
        accountId: true,
        platform: true,
        publishedAt: true,
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
    });

    const resultsByAccount = new Map<string, typeof publishResults30d>();
    for (const r of publishResults30d) {
      if (!resultsByAccount.has(r.accountId)) {
        resultsByAccount.set(r.accountId, []);
      }
      resultsByAccount.get(r.accountId)!.push(r);
    }

    const accountHealthData = accounts.map((account) => {
      const results = resultsByAccount.get(account.id) ?? [];
      const postsPublished30d = results.length;

      const insightedResults = results.filter(
        (r) => r.insights != null && (r.insights.reach ?? 0) > 0
      );
      let avgEngagementRate = 0;
      if (insightedResults.length > 0) {
        const totalRate = insightedResults.reduce((sum, r) => {
          const ins = r.insights!;
          const eng =
            (ins.likes ?? 0) + (ins.comments ?? 0) + (ins.shares ?? 0);
          return sum + (eng / (ins.reach ?? 1)) * 100;
        }, 0);
        avgEngagementRate =
          Math.round((totalRate / insightedResults.length) * 10) / 10;
      }

      const sortedByDate = results
        .filter((r) => r.publishedAt !== null)
        .sort(
          (a, b) =>
            new Date(b.publishedAt!).getTime() -
            new Date(a.publishedAt!).getTime()
        );
      const lastPublishedAt =
        sortedByDate.length > 0
          ? sortedByDate[0].publishedAt!.toISOString()
          : null;
      const daysSinceLastPost =
        lastPublishedAt !== null
          ? Math.floor(
              (now.getTime() - new Date(lastPublishedAt).getTime()) /
                (1000 * 60 * 60 * 24)
            )
          : null;

      let followerGrowth30d: number | null = null;
      const audienceMetrics = account.audienceMetrics;
      if (audienceMetrics.length >= 2) {
        const latest = audienceMetrics[0].followersCount ?? null;
        const oldest = audienceMetrics[audienceMetrics.length - 1].followersCount ?? null;
        if (latest !== null && oldest !== null) {
          followerGrowth30d = latest - oldest;
        }
      }

      const activityScore = Math.min(postsPublished30d * 5, 50);
      const engagementScore = Math.min(avgEngagementRate * 6, 30);
      let recencyScore = 0;
      if (daysSinceLastPost !== null) {
        if (daysSinceLastPost <= 7) recencyScore = 20;
        else if (daysSinceLastPost <= 14) recencyScore = 10;
        else if (daysSinceLastPost <= 30) recencyScore = 5;
      }
      const healthScore = Math.round(activityScore + engagementScore + recencyScore);

      return {
        accountId: account.id,
        accountName: account.accountName,
        platform: account.platform,
        isActive: account.isActive,
        healthScore,
        healthLabel:
          healthScore >= 70
            ? "Healthy"
            : healthScore >= 40
            ? "Fair"
            : "Needs Attention",
        metrics: {
          postsPublished30d,
          avgEngagementRate,
          followerGrowth30d,
          lastPublishedAt,
          daysSinceLastPost,
        },
      };
    });

    const avgAccountHealth =
      accountHealthData.length > 0
        ? Math.round(
            accountHealthData.reduce((s, a) => s + a.healthScore, 0) /
              accountHealthData.length
          )
        : 0;

    // ── 2. Content Mix ────────────────────────────────────────────────────────

    const publishedPosts30d = await prisma.post.findMany({
      where: {
        userId,
        status: PostStatus.PUBLISHED,
        updatedAt: { gte: thirtyDaysAgo },
      },
      select: {
        id: true,
        content: true,
        contentCategory: true,
        publishResults: {
          select: {
            insights: {
              select: {
                likes: true,
                comments: true,
                shares: true,
                impressions: true,
                reach: true,
              },
            },
          },
        },
      },
    });

    const contentMixMap = new Map<
      string,
      { count: number; totalEng: number; insightCount: number }
    >();
    for (const post of publishedPosts30d) {
      const key = post.contentCategory ?? "UNCATEGORIZED";
      const entry = contentMixMap.get(key) ?? {
        count: 0,
        totalEng: 0,
        insightCount: 0,
      };
      entry.count += 1;
      for (const pr of post.publishResults) {
        if (pr.insights != null) {
          entry.totalEng +=
            (pr.insights.likes ?? 0) +
            (pr.insights.comments ?? 0) +
            (pr.insights.shares ?? 0);
          entry.insightCount += 1;
        }
      }
      contentMixMap.set(key, entry);
    }
    const totalPosts = publishedPosts30d.length;
    const contentMixData = Array.from(contentMixMap.entries())
      .map(([category, { count, totalEng, insightCount }]) => ({
        category,
        count,
        percentage: totalPosts > 0 ? Math.round((count / totalPosts) * 100) : 0,
        avgEngagement:
          insightCount > 0
            ? Math.round((totalEng / insightCount) * 10) / 10
            : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // ── 3. Posting Patterns (Frequency) ──────────────────────────────────────

    const platformFrequency = computePlatformFrequency(
      publishResults30d.map((r) => ({ platform: r.platform as string })),
      30
    );
    const overallPacing =
      platformFrequency.length > 0
        ? Math.round(
            platformFrequency.reduce((s, p) => s + p.pacingScore, 0) /
              platformFrequency.length
          )
        : 0;

    // ── 4. Consistency Score ──────────────────────────────────────────────────

    const allPublishedPosts = await prisma.post.findMany({
      where: {
        userId,
        status: { in: [PostStatus.PUBLISHED, PostStatus.SCHEDULED] },
        OR: [
          { updatedAt: { gte: thirtyDaysAgo } },
          { scheduledAt: { gte: thirtyDaysAgo } },
        ],
      },
      select: { updatedAt: true, scheduledAt: true, status: true },
    });
    const postDates = allPublishedPosts.map((p) =>
      p.status === PostStatus.PUBLISHED
        ? p.updatedAt
        : (p.scheduledAt ?? p.updatedAt)
    );
    const consistencyResult = computeConsistency(postDates, 30);

    // ── 5. Engagement Benchmarks ──────────────────────────────────────────────

    const insightRows = publishResults30d
      .filter((r) => r.insights != null)
      .map((r) => ({
        platform: r.platform,
        insights: r.insights
          ? {
              impressions: r.insights.impressions ?? null,
              reach: r.insights.reach ?? null,
              likes: r.insights.likes ?? null,
              comments: r.insights.comments ?? null,
              shares: r.insights.shares ?? null,
            }
          : null,
      }));

    const benchmarkComparisons = computeBenchmarkComparisons(
      insightRows as Parameters<typeof computeBenchmarkComparisons>[0]
    );
    const aboveBenchmarkCount = benchmarkComparisons.filter(
      (b) => b.performance === "above"
    ).length;
    const totalBenchmarkPlatforms = benchmarkComparisons.filter(
      (b) => b.performance !== "insufficient"
    ).length;
    const avgEngagementOverall =
      benchmarkComparisons.length > 0
        ? benchmarkComparisons.reduce(
            (s, b) => s + b.userMetrics.avgEngagementRate,
            0
          ) / benchmarkComparisons.length
        : 0;

    // ── 6. Top Content ────────────────────────────────────────────────────────

    const topResultsRaw = await prisma.publishResult.findMany({
      where: {
        post: { userId },
        status: PublishStatus.PUBLISHED,
        publishedAt: { gte: thirtyDaysAgo },
        insights: { isNot: null },
      },
      select: {
        postId: true,
        platform: true,
        publishedAt: true,
        insights: {
          select: {
            likes: true,
            comments: true,
            shares: true,
            impressions: true,
            reach: true,
          },
        },
        post: { select: { id: true, content: true } },
      },
      orderBy: { publishedAt: "desc" },
      take: 100,
    });

    const topByPost = new Map<
      string,
      { content: string; totalScore: number; platforms: string[] }
    >();
    for (const r of topResultsRaw) {
      const ins = r.insights!;
      const score = computeScore(ins as Parameters<typeof computeScore>[0]);
      const entry = topByPost.get(r.postId) ?? {
        content: r.post.content,
        totalScore: 0,
        platforms: [],
      };
      entry.totalScore += score;
      entry.platforms.push(r.platform);
      topByPost.set(r.postId, entry);
    }

    const topContent = Array.from(topByPost.entries())
      .map(([postId, { content, totalScore, platforms }]) => ({
        postId,
        contentPreview: content.slice(0, 100),
        score: Math.round(totalScore),
        platforms: [...new Set(platforms)],
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    // ── 7. Compute Overall Score ──────────────────────────────────────────────

    // Weighted: account health 30%, consistency 25%, pacing 20%, benchmarks 25%
    const benchmarkScore =
      totalBenchmarkPlatforms > 0
        ? Math.round((aboveBenchmarkCount / totalBenchmarkPlatforms) * 100)
        : publishResults30d.length > 0
        ? 50
        : 0;

    const overallScore = Math.min(
      100,
      Math.max(
        0,
        Math.round(
          avgAccountHealth * 0.3 +
            consistencyResult.score * 0.25 +
            overallPacing * 0.2 +
            benchmarkScore * 0.25
        )
      )
    );

    // ── 8. Recommendations ────────────────────────────────────────────────────

    const recommendations = buildRecommendations({
      overallScore,
      accounts: accounts.length,
      postsPublished30d: totalPosts,
      consistencyScore: consistencyResult.score,
      avgEngagementRate: avgEngagementOverall,
      aboveBenchmarkCount,
      totalBenchmarkPlatforms,
    });

    // ── 9. Store & Return ─────────────────────────────────────────────────────

    const report = await prisma.auditReport.create({
      data: {
        userId,
        period,
        accountHealth: accountHealthData as unknown as object,
        contentMix: {
          total: totalPosts,
          categories: contentMixData,
        } as unknown as object,
        postingPatterns: {
          platforms: platformFrequency,
          overallPacingScore: overallPacing,
        } as unknown as object,
        engagementBenchmarks: benchmarkComparisons as unknown as object,
        consistencyScore: consistencyResult as unknown as object,
        topContent: topContent as unknown as object,
        recommendations,
        overallScore,
      },
    });

    return NextResponse.json({
      id: report.id,
      period: report.period,
      generatedAt: report.generatedAt.toISOString(),
      overallScore: report.overallScore,
      overallGrade: gradeFromScore(report.overallScore),
      accountHealth: accountHealthData,
      contentMix: { total: totalPosts, categories: contentMixData },
      postingPatterns: {
        platforms: platformFrequency,
        overallPacingScore: overallPacing,
      },
      engagementBenchmarks: benchmarkComparisons,
      consistencyScore: consistencyResult,
      topContent,
      recommendations,
    } satisfies AuditReportData);
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── GET /api/analytics/audit ──────────────────────────────────────────────────

export async function GET(_request: NextRequest): Promise<NextResponse> {
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

    const reports = await prisma.auditReport.findMany({
      where: { userId: session.user.id },
      orderBy: { generatedAt: "desc" },
      take: 10,
      select: {
        id: true,
        period: true,
        generatedAt: true,
        overallScore: true,
      },
    });

    return NextResponse.json({
      reports: reports.map((r) => ({
        id: r.id,
        period: r.period,
        generatedAt: r.generatedAt.toISOString(),
        overallScore: r.overallScore,
      })),
    } satisfies AuditListResponse);
  } catch (err) {
    return handleRouteError(err);
  }
}
