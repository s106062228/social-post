import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PublishStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import {
  detectViralPosts,
  type PostVelocityData,
} from "@/lib/viral-detection";

export type { PostVelocityData };

const querySchema = z.object({
  period: z.enum(["24h", "48h", "7d"]).default("7d"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export interface ViralPostsResponse {
  period: string;
  posts: (PostVelocityData & { content: string })[];
  avgVelocity: number;
  totalPosts: number;
}

// ── GET /api/analytics/viral-posts ───────────────────────────────────────────

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
      period: request.nextUrl.searchParams.get("period") ?? "7d",
      limit: request.nextUrl.searchParams.get("limit") ?? "20",
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { period, limit } = parsed.data;
    const userId = session.user.id;

    const hoursBack = period === "24h" ? 24 : period === "48h" ? 48 : 7 * 24;
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    // Fetch PUBLISHED posts with their per-platform publish results + insights
    const posts = await prisma.post.findMany({
      where: {
        userId,
        status: "PUBLISHED",
        updatedAt: { gte: since },
      },
      select: {
        id: true,
        content: true,
        publishResults: {
          where: {
            status: PublishStatus.PUBLISHED,
            publishedAt: { not: null },
          },
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

    // Flatten to per-publishResult entries (one per platform per post)
    const flattened = posts.flatMap((post) =>
      post.publishResults
        .filter((pr) => pr.publishedAt !== null && pr.insights !== null)
        .map((pr) => ({
          postId: post.id,
          content: post.content,
          publishedAt: pr.publishedAt as Date,
          platform: pr.platform,
          insights: pr.insights ?? {},
        }))
    );

    const ranked = detectViralPosts(flattened);
    const limited = ranked.slice(0, limit);

    const totalVelocity = ranked.reduce((sum, p) => sum + p.velocityPerHour, 0);
    const avgVelocity = ranked.length > 0 ? totalVelocity / ranked.length : 0;

    return NextResponse.json({
      period,
      posts: limited,
      avgVelocity,
      totalPosts: flattened.length,
    } satisfies ViralPostsResponse);
  } catch (err) {
    return handleRouteError(err);
  }
}
