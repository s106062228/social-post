import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PostStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const querySchema = z.object({
  period: z.enum(["7d", "30d", "90d"]).default("30d"),
});

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

    const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = querySchema.safeParse(searchParams);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 });
    }

    const { period } = parsed.data;
    const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const posts = await prisma.post.findMany({
      where: {
        userId: session.user.id,
        status: PostStatus.PUBLISHED,
        updatedAt: { gte: since },
        tone: { not: null },
      },
      select: { tone: true },
    });

    const totalPosts = await prisma.post.count({
      where: {
        userId: session.user.id,
        status: PostStatus.PUBLISHED,
        updatedAt: { gte: since },
      },
    });

    const analyzedPosts = posts.length;

    if (analyzedPosts === 0) {
      return NextResponse.json({
        consistency: 0,
        dominantTone: null,
        toneDistribution: [],
        analyzedPosts: 0,
        totalPosts,
        period,
      });
    }

    // Compute frequency map
    const toneCount: Record<string, number> = {};
    for (const post of posts) {
      const t = post.tone!;
      toneCount[t] = (toneCount[t] ?? 0) + 1;
    }

    const entries = Object.entries(toneCount).sort((a, b) => b[1] - a[1]);
    const dominantTone = entries[0][0];
    const dominantCount = entries[0][1];
    const consistency = Math.round((dominantCount / analyzedPosts) * 100);

    const toneDistribution = entries.map(([tone, count]) => ({
      tone,
      count,
      percentage: Math.round((count / analyzedPosts) * 100),
    }));

    return NextResponse.json({
      consistency,
      dominantTone,
      toneDistribution,
      analyzedPosts,
      totalPosts,
      period,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
