import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

export async function GET(
  request: NextRequest,
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

    const campaign = await prisma.hashtagCampaign.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!campaign) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const hashtags = campaign.hashtags as string[];
    if (hashtags.length === 0) {
      return NextResponse.json({
        campaign,
        totalPosts: 0,
        totalImpressions: 0,
        totalReach: 0,
        totalLikes: 0,
        totalComments: 0,
        totalShares: 0,
        avgEngagement: 0,
        byHashtag: [],
        byPlatform: [],
        topPosts: [],
        dailyActivity: [],
      });
    }

    // Build date filter
    const dateFilter: { gte?: Date; lte?: Date } = {};
    dateFilter.gte = campaign.startDate;
    if (campaign.endDate) dateFilter.lte = campaign.endDate;

    // Find posts with matching hashtags in content
    const userPosts = await prisma.post.findMany({
      where: {
        userId: session.user.id,
        status: "PUBLISHED",
        updatedAt: dateFilter,
      },
      include: {
        publishResults: {
          where: { status: "PUBLISHED" },
          include: { insights: true },
        },
      },
    });

    const targetPlatforms = campaign.targetPlatforms as string[];

    // Filter posts that contain at least one campaign hashtag
    const matchingPosts = userPosts.filter((post) => {
      const content = post.content.toLowerCase();
      return hashtags.some((tag) => {
        const normalized = tag.startsWith("#") ? tag.toLowerCase() : `#${tag.toLowerCase()}`;
        return content.includes(normalized);
      });
    });

    // Apply platform filter if specified
    const filteredPosts =
      targetPlatforms.length > 0
        ? matchingPosts.filter((post) =>
            post.publishResults.some((pr) =>
              targetPlatforms.includes(pr.platform as string)
            )
          )
        : matchingPosts;

    // Aggregate totals
    let totalImpressions = 0;
    let totalReach = 0;
    let totalLikes = 0;
    let totalComments = 0;
    let totalShares = 0;

    const hashtagMap = new Map<string, { postCount: number; totalEngagement: number }>();
    const platformMap = new Map<string, { postCount: number; totalEngagement: number }>();
    const dayMap = new Map<string, { postCount: number; totalEngagement: number }>();
    const postEngagementMap = new Map<
      string,
      { content: string; totalEngagement: number; publishedAt: Date | null }
    >();

    for (const hashtag of hashtags) {
      const normalized = hashtag.startsWith("#") ? hashtag : `#${hashtag}`;
      hashtagMap.set(normalized.toLowerCase(), { postCount: 0, totalEngagement: 0 });
    }

    for (const post of filteredPosts) {
      const postContent = post.content.toLowerCase();
      let postEngagement = 0;
      let postImpressions = 0;
      let postReach = 0;
      let postLikes = 0;
      let postComments = 0;
      let postShares = 0;
      let firstPublishedAt: Date | null = null;

      const relevantResults =
        targetPlatforms.length > 0
          ? post.publishResults.filter((pr) =>
              targetPlatforms.includes(pr.platform as string)
            )
          : post.publishResults;

      for (const pr of relevantResults) {
        const platform = pr.platform as string;
        if (pr.publishedAt && (!firstPublishedAt || pr.publishedAt < firstPublishedAt)) {
          firstPublishedAt = pr.publishedAt;
        }

        for (const insight of pr.insights) {
          const engagement =
            (insight.likes ?? 0) + (insight.comments ?? 0) + (insight.shares ?? 0);
          postImpressions += insight.impressions ?? 0;
          postReach += insight.reach ?? 0;
          postLikes += insight.likes ?? 0;
          postComments += insight.comments ?? 0;
          postShares += insight.shares ?? 0;
          postEngagement += engagement;

          // Platform aggregation
          const platEntry = platformMap.get(platform) ?? { postCount: 0, totalEngagement: 0 };
          platEntry.totalEngagement += engagement;
          platformMap.set(platform, platEntry);
        }

        const platEntry = platformMap.get(platform);
        if (platEntry && !platEntry.postCount) {
          platEntry.postCount = 0;
        }
      }

      // Count post per platform (once per platform, not per insight)
      for (const pr of relevantResults) {
        const platform = pr.platform as string;
        const platEntry = platformMap.get(platform);
        if (platEntry) {
          // already set engagement; track post count separately
        } else {
          platformMap.set(platform, { postCount: 0, totalEngagement: 0 });
        }
      }

      totalImpressions += postImpressions;
      totalReach += postReach;
      totalLikes += postLikes;
      totalComments += postComments;
      totalShares += postShares;

      // Per-hashtag aggregation
      for (const [normalizedTag, entry] of hashtagMap) {
        if (postContent.includes(normalizedTag)) {
          entry.postCount += 1;
          entry.totalEngagement += postEngagement;
        }
      }

      // Per-day aggregation
      const dateKey = (firstPublishedAt ?? post.updatedAt).toISOString().slice(0, 10);
      const dayEntry = dayMap.get(dateKey) ?? { postCount: 0, totalEngagement: 0 };
      dayEntry.postCount += 1;
      dayEntry.totalEngagement += postEngagement;
      dayMap.set(dateKey, dayEntry);

      postEngagementMap.set(post.id, {
        content: post.content.slice(0, 100),
        totalEngagement: postEngagement,
        publishedAt: firstPublishedAt,
      });
    }

    // Re-count per-platform post counts
    const platformPostCounts = new Map<string, number>();
    for (const post of filteredPosts) {
      const seen = new Set<string>();
      const relevantResults =
        targetPlatforms.length > 0
          ? post.publishResults.filter((pr) =>
              targetPlatforms.includes(pr.platform as string)
            )
          : post.publishResults;
      for (const pr of relevantResults) {
        const platform = pr.platform as string;
        if (!seen.has(platform)) {
          seen.add(platform);
          platformPostCounts.set(platform, (platformPostCounts.get(platform) ?? 0) + 1);
        }
      }
    }

    const totalPosts = filteredPosts.length;
    const totalEngagementAll = totalLikes + totalComments + totalShares;
    const avgEngagement = totalPosts > 0 ? Math.round(totalEngagementAll / totalPosts) : 0;

    const byHashtag = Array.from(hashtagMap.entries())
      .map(([hashtag, data]) => ({ hashtag, ...data }))
      .sort((a, b) => b.totalEngagement - a.totalEngagement);

    const byPlatform = Array.from(platformMap.entries()).map(([platform, data]) => ({
      platform,
      postCount: platformPostCounts.get(platform) ?? 0,
      totalEngagement: data.totalEngagement,
    })).sort((a, b) => b.totalEngagement - a.totalEngagement);

    const topPosts = Array.from(postEngagementMap.entries())
      .map(([postId, data]) => ({ postId, ...data }))
      .sort((a, b) => b.totalEngagement - a.totalEngagement)
      .slice(0, 5)
      .map((p) => ({
        postId: p.postId,
        content: p.content,
        totalEngagement: p.totalEngagement,
        publishedAt: p.publishedAt?.toISOString() ?? null,
      }));

    const dailyActivity = Array.from(dayMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      campaign,
      totalPosts,
      totalImpressions,
      totalReach,
      totalLikes,
      totalComments,
      totalShares,
      avgEngagement,
      byHashtag,
      byPlatform,
      topPosts,
      dailyActivity,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
