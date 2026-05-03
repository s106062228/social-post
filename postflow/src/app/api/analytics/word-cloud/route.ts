import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PostStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { computeWordFrequency, type WordCount } from "@/lib/word-frequency";

const querySchema = z.object({
  period: z.enum(["7d", "30d", "90d"]).default("30d"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export interface WordCloudResponse {
  period: string;
  words: WordCount[];
  totalPosts: number;
}

// ── GET /api/analytics/word-cloud ─────────────────────────────────────────────

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
      limit: request.nextUrl.searchParams.get("limit") ?? "50",
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { period, limit } = parsed.data;
    const userId = session.user.id;

    const daysBack = period === "7d" ? 7 : period === "30d" ? 30 : 90;
    const since = new Date();
    since.setDate(since.getDate() - daysBack);

    const posts = await prisma.post.findMany({
      where: {
        userId,
        status: PostStatus.PUBLISHED,
        updatedAt: { gte: since },
      },
      select: { content: true },
    });

    const words = computeWordFrequency(
      posts.map((p) => p.content),
      limit
    );

    return NextResponse.json({
      period,
      words,
      totalPosts: posts.length,
    } satisfies WordCloudResponse);
  } catch (err) {
    return handleRouteError(err);
  }
}
