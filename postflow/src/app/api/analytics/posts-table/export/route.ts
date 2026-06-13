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
});

function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

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
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { period, sort, dir, platform } = parsed.data;
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

    const results = await prisma.publishResult.findMany({
      where: {
        post: { userId },
        status: PublishStatus.PUBLISHED,
        ...(since ? { publishedAt: { gte: since } } : {}),
        ...platformFilter,
      },
      include: {
        post: { select: { content: true } },
        insights: true,
      },
    });

    const rows = results.map((r) => {
      const ins = r.insights;
      const impressions = ins?.impressions ?? 0;
      const reach = ins?.reach ?? 0;
      const likes = ins?.likes ?? 0;
      const comments = ins?.comments ?? 0;
      const shares = ins?.shares ?? 0;
      const score = ins ? computeScore({ impressions, reach, likes, comments, shares }) : 0;
      return {
        postId: r.postId,
        content: r.post.content,
        platform: r.platform,
        publishedAt: r.publishedAt?.toISOString() ?? "",
        publishedUrl: r.publishedUrl ?? "",
        impressions,
        reach,
        likes,
        comments,
        shares,
        engagementScore: score,
      };
    });

    // Sort
    const sortKey = sort === "date" ? "publishedAt" : sort === "engagement" ? "engagementScore" : sort;
    rows.sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortKey] ?? 0;
      const bv = (b as Record<string, unknown>)[sortKey] ?? 0;
      if (typeof av === "string" && typeof bv === "string") {
        return dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return dir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });

    const header = [
      "post_id",
      "content",
      "platform",
      "published_at",
      "published_url",
      "impressions",
      "reach",
      "likes",
      "comments",
      "shares",
      "engagement_score",
    ].join(",");

    const lines = rows.map((r) =>
      [
        escapeCsv(r.postId),
        escapeCsv(r.content),
        escapeCsv(r.platform),
        escapeCsv(r.publishedAt),
        escapeCsv(r.publishedUrl),
        escapeCsv(r.impressions),
        escapeCsv(r.reach),
        escapeCsv(r.likes),
        escapeCsv(r.comments),
        escapeCsv(r.shares),
        escapeCsv(r.engagementScore),
      ].join(",")
    );

    const csv = [header, ...lines].join("\n");
    const date = new Date().toISOString().split("T")[0];

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="postflow-posts-${date}-${period}.csv"`,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
