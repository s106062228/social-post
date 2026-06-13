import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PublishStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { computeScore } from "@/lib/content-score";

const querySchema = z.object({
  period: z.enum(["7d", "30d", "90d", "all"]).default("30d"),
  sort: z
    .enum(["date", "engagement", "reach", "likes", "comments", "shares"])
    .default("date"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  platform: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
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

    const parsed = querySchema.safeParse({
      period: request.nextUrl.searchParams.get("period") ?? "30d",
      sort: request.nextUrl.searchParams.get("sort") ?? "date",
      dir: request.nextUrl.searchParams.get("dir") ?? "desc",
      platform: request.nextUrl.searchParams.get("platform") ?? undefined,
      page: request.nextUrl.searchParams.get("page") ?? "1",
      limit: request.nextUrl.searchParams.get("limit") ?? "50",
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { period, sort, dir, platform, page, limit } = parsed.data;
    const userId = session.user.id;

    let since: Date | undefined;
    if (period !== "all") {
      const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
      since = new Date();
      since.setDate(since.getDate() - days);
    }

    const platformFilter = platform
      ? { platform: platform as never }
      : undefined;

    // Fetch published results with insights
    const results = await prisma.publishResult.findMany({
      where: {
        post: { userId },
        status: PublishStatus.PUBLISHED,
        ...(since ? { publishedAt: { gte: since } } : {}),
        ...platformFilter,
      },
      include: {
        post: { select: { content: true, mediaType: true } },
        insights: true,
      },
    });

    // Build rows
    const rows = results.map((r) => {
      const ins = r.insights;
      const impressions = ins?.impressions ?? 0;
      const reach = ins?.reach ?? 0;
      const likes = ins?.likes ?? 0;
      const comments = ins?.comments ?? 0;
      const shares = ins?.shares ?? 0;
      const score = ins
        ? computeScore({
            impressions,
            reach,
            likes,
            comments,
            shares,
          })
        : 0;
      return {
        publishResultId: r.id,
        postId: r.postId,
        content:
          r.post.content.length > 80
            ? r.post.content.slice(0, 80) + "…"
            : r.post.content,
        platform: r.platform,
        publishedAt: r.publishedAt?.toISOString() ?? null,
        publishedUrl: r.publishedUrl ?? null,
        impressions,
        reach,
        likes,
        comments,
        shares,
        engagementScore: score,
      };
    });

    // Sort
    const sortKey = sort as keyof (typeof rows)[0];
    rows.sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (typeof av === "string" && typeof bv === "string") {
        return dir === "asc"
          ? av.localeCompare(bv)
          : bv.localeCompare(av);
      }
      return dir === "asc"
        ? (av as number) - (bv as number)
        : (bv as number) - (av as number);
    });

    const total = rows.length;
    const offset = (page - 1) * limit;
    const paged = rows.slice(offset, offset + limit);

    return NextResponse.json({
      rows: paged,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
