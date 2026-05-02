import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Platform, PublishStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const querySchema = z.object({
  platform: z.nativeEnum(Platform).optional(),
  period: z.enum(["30d", "90d", "all"]).default("90d"),
});

export interface BestTimeSlot {
  hour: number;
  dayOfWeek: number; // 0 = Sunday … 6 = Saturday
  avgEngagement: number;
  sampleSize: number;
}

export interface BestTimesResponse {
  platform: Platform | "ALL";
  period: string;
  slots: BestTimeSlot[];
  /** true when there were no PUBLISHED results with insights */
  empty: boolean;
}

// ── GET /api/analytics/best-times ────────────────────────────────────────────

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
      platform: request.nextUrl.searchParams.get("platform") ?? undefined,
      period: request.nextUrl.searchParams.get("period") ?? "90d",
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { platform, period } = parsed.data;
    const userId = session.user.id;

    let publishedSince: Date | undefined;
    if (period !== "all") {
      const daysBack = period === "30d" ? 30 : 90;
      publishedSince = new Date();
      publishedSince.setDate(publishedSince.getDate() - daysBack);
    }

    const results = await prisma.publishResult.findMany({
      where: {
        post: { userId },
        status: PublishStatus.PUBLISHED,
        publishedAt: { not: null, ...(publishedSince ? { gte: publishedSince } : {}) },
        ...(platform ? { platform } : {}),
        insights: { isNot: null },
      },
      select: {
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

    if (results.length === 0) {
      return NextResponse.json({
        platform: platform ?? "ALL",
        period,
        slots: [],
        empty: true,
      } satisfies BestTimesResponse);
    }

    // Aggregate engagement per (hour, dayOfWeek) bucket
    type BucketKey = `${number}_${number}`;
    const buckets = new Map<
      BucketKey,
      { totalEngagement: number; count: number }
    >();

    for (const r of results) {
      if (!r.publishedAt || !r.insights) continue;

      const d = new Date(r.publishedAt);
      const hour = d.getUTCHours();
      const dayOfWeek = d.getUTCDay();
      const key: BucketKey = `${hour}_${dayOfWeek}`;

      // Simple engagement score: likes×3 + comments×5 + shares×4 + reach×1 + impressions×0.5
      const ins = r.insights;
      const engagement =
        (ins.likes ?? 0) * 3 +
        (ins.comments ?? 0) * 5 +
        (ins.shares ?? 0) * 4 +
        (ins.reach ?? 0) * 1 +
        (ins.impressions ?? 0) * 0.5;

      const existing = buckets.get(key);
      if (existing) {
        existing.totalEngagement += engagement;
        existing.count += 1;
      } else {
        buckets.set(key, { totalEngagement: engagement, count: 1 });
      }
    }

    const slots: BestTimeSlot[] = Array.from(buckets.entries())
      .map(([key, { totalEngagement, count }]) => {
        const [hourStr, dayStr] = key.split("_");
        return {
          hour: parseInt(hourStr, 10),
          dayOfWeek: parseInt(dayStr, 10),
          avgEngagement: Math.round(totalEngagement / count),
          sampleSize: count,
        };
      })
      .sort((a, b) => b.avgEngagement - a.avgEngagement);

    return NextResponse.json({
      platform: platform ?? "ALL",
      period,
      slots,
      empty: false,
    } satisfies BestTimesResponse);
  } catch (err) {
    return handleRouteError(err);
  }
}
