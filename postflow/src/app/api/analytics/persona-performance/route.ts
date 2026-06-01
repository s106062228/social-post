import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PostStatus, PublishStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const querySchema = z.object({
  period: z.enum(["7d", "30d", "90d"]).default("30d"),
});

interface PlatformCount {
  platform: string;
  count: number;
}

interface TopPost {
  postId: string;
  content: string;
}

export interface PersonaPerformanceData {
  personaId: string | null;
  personaName: string;
  postCount: number;
  avgEngagement: number;
  totalImpressions: number;
  totalReach: number;
  topPost: TopPost | null;
  platforms: PlatformCount[];
}

export interface PersonaPerformanceResponse {
  period: string;
  personas: PersonaPerformanceData[];
  totalPosts: number;
}

// ── GET /api/analytics/persona-performance ────────────────────────────────────

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
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }

    const { period } = parsed.data;
    const daysBack = period === "7d" ? 7 : period === "30d" ? 30 : 90;
    const since = new Date();
    since.setDate(since.getDate() - daysBack);
    since.setHours(0, 0, 0, 0);

    // Fetch all PUBLISHED posts with targetPersonaId, publishResults and insights
    const posts = await prisma.post.findMany({
      where: {
        userId: session.user.id,
        status: PostStatus.PUBLISHED,
        updatedAt: { gte: since },
      },
      select: {
        id: true,
        content: true,
        targetPersonaId: true,
        publishResults: {
          where: { status: PublishStatus.PUBLISHED },
          select: {
            platform: true,
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

    // Load persona names for all personaIds referenced in posts
    const personaIdSet = new Set<string>();
    for (const post of posts) {
      if (post.targetPersonaId) {
        personaIdSet.add(post.targetPersonaId);
      }
    }

    const personaNameMap = new Map<string, string>();
    if (personaIdSet.size > 0) {
      const personas = await prisma.audiencePersona.findMany({
        where: {
          id: { in: Array.from(personaIdSet) },
          userId: session.user.id,
        },
        select: { id: true, name: true },
      });
      for (const p of personas) {
        personaNameMap.set(p.id, p.name);
      }
    }

    // Group posts by persona
    type PostGroup = {
      posts: typeof posts;
    };

    const groups = new Map<string | null, PostGroup>();

    for (const post of posts) {
      const key = post.targetPersonaId ?? null;
      const existing = groups.get(key);
      if (existing) {
        existing.posts.push(post);
      } else {
        groups.set(key, { posts: [post] });
      }
    }

    // Ensure null (unassigned) group is handled even if not present
    const personas: PersonaPerformanceData[] = [];

    for (const [personaId, group] of groups.entries()) {
      const personaName = personaId
        ? (personaNameMap.get(personaId) ?? "Unknown")
        : "Unassigned";

      let totalEngagement = 0;
      let engagedPostCount = 0;
      let totalImpressions = 0;
      let totalReach = 0;
      let topPostId: string | null = null;
      let topPostContent: string | null = null;
      let topPostEngagement = -1;

      const platformCounts = new Map<string, number>();

      for (const post of group.posts) {
        let postEngagement = 0;
        let postHasInsights = false;

        for (const result of post.publishResults) {
          // Count platform distribution
          const plat = String(result.platform);
          platformCounts.set(plat, (platformCounts.get(plat) ?? 0) + 1);

          if (result.insights) {
            const engagement =
              (result.insights.likes ?? 0) +
              (result.insights.comments ?? 0) +
              (result.insights.shares ?? 0);
            postEngagement += engagement;
            totalImpressions += result.insights.impressions ?? 0;
            totalReach += result.insights.reach ?? 0;
            postHasInsights = true;
          }
        }

        if (postHasInsights) {
          totalEngagement += postEngagement;
          engagedPostCount++;

          if (postEngagement > topPostEngagement) {
            topPostEngagement = postEngagement;
            topPostId = post.id;
            topPostContent = post.content;
          }
        }
      }

      const avgEngagement =
        engagedPostCount > 0
          ? Math.round((totalEngagement / engagedPostCount) * 100) / 100
          : 0;

      const platforms: PlatformCount[] = Array.from(platformCounts.entries()).map(
        ([platform, count]) => ({ platform, count })
      );
      platforms.sort((a, b) => b.count - a.count);

      personas.push({
        personaId,
        personaName,
        postCount: group.posts.length,
        avgEngagement,
        totalImpressions,
        totalReach,
        topPost:
          topPostId && topPostContent
            ? {
                postId: topPostId,
                content: topPostContent.slice(0, 80),
              }
            : null,
        platforms,
      });
    }

    // Sort: named personas by avgEngagement descending, unassigned at end
    personas.sort((a, b) => {
      if (a.personaId === null && b.personaId !== null) return 1;
      if (a.personaId !== null && b.personaId === null) return -1;
      return b.avgEngagement - a.avgEngagement;
    });

    const response: PersonaPerformanceResponse = {
      period,
      personas,
      totalPosts: posts.length,
    };

    return NextResponse.json(response);
  } catch (err) {
    return handleRouteError(err);
  }
}
