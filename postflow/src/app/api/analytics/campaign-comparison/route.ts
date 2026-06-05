import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PublishStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const querySchema = z.object({
  period: z.enum(["30d", "90d", "all"]).default("30d"),
});

export type CampaignType = "content" | "hashtag" | "collaboration";

export interface CampaignComparisonItem {
  id: string;
  name: string;
  type: CampaignType;
  postCount: number;
  engagement: number;
  impressions: number;
  reach: number;
  avgEngagement: number;
  budget?: number;
  costPerEngagement?: number;
  isActive: boolean;
}

export interface CampaignComparisonResponse {
  period: string;
  campaigns: CampaignComparisonItem[];
  totalCampaigns: number;
  totalPosts: number;
  totalEngagement: number;
  topCampaign: CampaignComparisonItem | null;
}

function getPeriodStart(period: string): Date | undefined {
  if (period === "all") return undefined;
  const days = period === "30d" ? 30 : 90;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

// ── GET /api/analytics/campaign-comparison ───────────────────────────────────

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
    const since = getPeriodStart(period);

    const items: CampaignComparisonItem[] = [];

    // ── 1. Content Campaigns ─────────────────────────────────────────────────
    const contentCampaigns = await prisma.campaign.findMany({
      where: { userId },
      include: {
        posts: {
          include: {
            post: {
              include: {
                publishResults: {
                  where: {
                    status: PublishStatus.PUBLISHED,
                    ...(since ? { publishedAt: { gte: since } } : {}),
                  },
                  include: {
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
                },
              },
            },
          },
        },
      },
    });

    for (const campaign of contentCampaigns) {
      let engagement = 0;
      let impressions = 0;
      let reach = 0;
      let postCount = 0;
      const seenPostIds = new Set<string>();

      for (const cp of campaign.posts) {
        const { post } = cp;
        if (seenPostIds.has(post.id)) continue;
        seenPostIds.add(post.id);

        if (post.publishResults.length > 0) postCount++;

        for (const result of post.publishResults) {
          if (result.insights) {
            engagement +=
              (result.insights.likes ?? 0) +
              (result.insights.comments ?? 0) +
              (result.insights.shares ?? 0);
            impressions += result.insights.impressions ?? 0;
            reach += result.insights.reach ?? 0;
          }
        }
      }

      items.push({
        id: campaign.id,
        name: campaign.name,
        type: "content",
        postCount,
        engagement,
        impressions,
        reach,
        avgEngagement: postCount > 0 ? Math.round(engagement / postCount) : 0,
        isActive: campaign.isActive,
      });
    }

    // ── 2. Hashtag Campaigns ─────────────────────────────────────────────────
    const hashtagCampaigns = await prisma.hashtagCampaign.findMany({
      where: { userId },
    });

    for (const hc of hashtagCampaigns) {
      if (hc.hashtags.length === 0) {
        items.push({
          id: hc.id,
          name: hc.name,
          type: "hashtag",
          postCount: 0,
          engagement: 0,
          impressions: 0,
          reach: 0,
          avgEngagement: 0,
          isActive: hc.isActive,
        });
        continue;
      }

      const hashtagConditions = hc.hashtags.map((tag) => ({
        content: { contains: tag, mode: "insensitive" as const },
      }));

      const matchingPosts = await prisma.post.findMany({
        where: {
          userId,
          status: "PUBLISHED",
          ...(since ? { updatedAt: { gte: since } } : {}),
          OR: hashtagConditions,
        },
        include: {
          publishResults: {
            where: { status: PublishStatus.PUBLISHED },
            include: {
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
          },
        },
      });

      let engagement = 0;
      let impressions = 0;
      let reach = 0;

      for (const post of matchingPosts) {
        for (const result of post.publishResults) {
          if (result.insights) {
            engagement +=
              (result.insights.likes ?? 0) +
              (result.insights.comments ?? 0) +
              (result.insights.shares ?? 0);
            impressions += result.insights.impressions ?? 0;
            reach += result.insights.reach ?? 0;
          }
        }
      }

      items.push({
        id: hc.id,
        name: hc.name,
        type: "hashtag",
        postCount: matchingPosts.length,
        engagement,
        impressions,
        reach,
        avgEngagement:
          matchingPosts.length > 0
            ? Math.round(engagement / matchingPosts.length)
            : 0,
        isActive: hc.isActive,
      });
    }

    // ── 3. Collaborations ────────────────────────────────────────────────────
    const collaborations = await prisma.collaboration.findMany({
      where: { userId },
      include: {
        posts: {
          include: {
            post: {
              include: {
                publishResults: {
                  where: {
                    status: PublishStatus.PUBLISHED,
                    ...(since ? { publishedAt: { gte: since } } : {}),
                  },
                  include: {
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
                },
              },
            },
          },
        },
      },
    });

    for (const collab of collaborations) {
      let engagement = 0;
      let impressions = 0;
      let reach = 0;
      let postCount = 0;
      const seenPostIds = new Set<string>();

      for (const cp of collab.posts) {
        const { post } = cp;
        if (seenPostIds.has(post.id)) continue;
        seenPostIds.add(post.id);

        if (post.publishResults.length > 0) postCount++;

        for (const result of post.publishResults) {
          if (result.insights) {
            engagement +=
              (result.insights.likes ?? 0) +
              (result.insights.comments ?? 0) +
              (result.insights.shares ?? 0);
            impressions += result.insights.impressions ?? 0;
            reach += result.insights.reach ?? 0;
          }
        }
      }

      const costPerEngagement =
        collab.budget != null && engagement > 0
          ? Math.round((collab.budget / engagement) * 100) / 100
          : undefined;

      items.push({
        id: collab.id,
        name: `${collab.name} × ${collab.partnerName}`,
        type: "collaboration",
        postCount,
        engagement,
        impressions,
        reach,
        avgEngagement: postCount > 0 ? Math.round(engagement / postCount) : 0,
        budget: collab.budget ?? undefined,
        costPerEngagement,
        isActive: collab.status === "ACTIVE",
      });
    }

    // Sort by engagement descending
    items.sort((a, b) => b.engagement - a.engagement);

    const totalPosts = items.reduce((s, c) => s + c.postCount, 0);
    const totalEngagement = items.reduce((s, c) => s + c.engagement, 0);
    const topCampaign = items.length > 0 ? items[0] : null;

    return NextResponse.json({
      period,
      campaigns: items,
      totalCampaigns: items.length,
      totalPosts,
      totalEngagement,
      topCampaign,
    } satisfies CampaignComparisonResponse);
  } catch (err) {
    return handleRouteError(err);
  }
}
