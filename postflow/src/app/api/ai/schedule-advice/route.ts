import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { handleRouteError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { generateScheduleAdvice } from "@/lib/ai";

export async function POST(request: NextRequest): Promise<NextResponse> {
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

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "AI features are not configured" },
        { status: 503 }
      );
    }

    const userId = session.user.id;
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Gather posting history: counts by day and platform
    const recentPosts = await prisma.post.findMany({
      where: { userId, createdAt: { gte: since } },
      select: {
        createdAt: true,
        status: true,
        scheduledAt: true,
        publishResults: {
          select: {
            platform: true,
            status: true,
            publishedAt: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // Gather top-level engagement insights
    const insightRows = await prisma.postInsights.findMany({
      where: {
        publishResult: {
          post: { userId },
          publishedAt: { gte: since },
        },
      },
      select: {
        impressions: true,
        reach: true,
        likes: true,
        comments: true,
        shares: true,
        publishResult: {
          select: {
            platform: true,
            publishedAt: true,
          },
        },
      },
    });

    // Build human-readable history summary
    const totalPosts = recentPosts.length;
    const publishedCount = recentPosts.filter((p) => p.status === "PUBLISHED").length;
    const scheduledCount = recentPosts.filter((p) => p.status === "SCHEDULED").length;
    const draftCount = recentPosts.filter((p) => p.status === "DRAFT").length;

    const platformCounts: Record<string, number> = {};
    const hourCounts: Record<number, number> = {};

    for (const post of recentPosts) {
      for (const pr of post.publishResults) {
        platformCounts[pr.platform] = (platformCounts[pr.platform] ?? 0) + 1;
        if (pr.publishedAt) {
          const h = new Date(pr.publishedAt).getUTCHours();
          hourCounts[h] = (hourCounts[h] ?? 0) + 1;
        }
      }
    }

    const topHours = Object.entries(hourCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([h]) => `${h}:00 UTC`);

    const historySummary =
      `Last 30 days: ${totalPosts} posts created (${publishedCount} published, ${scheduledCount} scheduled, ${draftCount} drafts). ` +
      `Platform distribution: ${Object.entries(platformCounts).map(([p, c]) => `${p}: ${c}`).join(", ") || "no published posts"}. ` +
      `Most active posting hours: ${topHours.length ? topHours.join(", ") : "no data"}.`;

    // Build engagement insights summary
    let insightsSummary: string;
    if (insightRows.length === 0) {
      insightsSummary = "No engagement data available yet.";
    } else {
      const platformEngagement: Record<string, { total: number; count: number }> = {};

      for (const row of insightRows) {
        const platform = row.publishResult.platform;
        const engagement =
          (row.likes ?? 0) + (row.comments ?? 0) + (row.shares ?? 0);
        if (!platformEngagement[platform]) {
          platformEngagement[platform] = { total: 0, count: 0 };
        }
        platformEngagement[platform].total += engagement;
        platformEngagement[platform].count += 1;
      }

      insightsSummary = Object.entries(platformEngagement)
        .map(([p, { total, count }]) => {
          const avg = count > 0 ? Math.round(total / count) : 0;
          return `${p}: avg ${avg} engagements/post across ${count} posts`;
        })
        .join("; ");
    }

    const recommendations = await generateScheduleAdvice(historySummary, insightsSummary);

    return NextResponse.json({ recommendations });
  } catch (err) {
    return handleRouteError(err);
  }
}
