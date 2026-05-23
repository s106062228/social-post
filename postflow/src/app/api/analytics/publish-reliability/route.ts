import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PublishStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import {
  computePlatformReliability,
  type PlatformReliabilityData,
} from "@/lib/publish-reliability";

const PERIOD_DAYS: Record<string, number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: null,
};

const querySchema = z.object({
  period: z.enum(["7d", "30d", "90d", "all"]).default("30d"),
});

export interface PublishReliabilityResponse {
  period: string;
  platforms: PlatformReliabilityData[];
  overallSuccessRate: number;
  totalPublished: number;
  totalFailed: number;
}

// ── GET /api/analytics/publish-reliability ────────────────────────────────────

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

    const daysBack = PERIOD_DAYS[period];
    const since =
      daysBack !== null
        ? new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)
        : undefined;

    const results = await prisma.publishResult.findMany({
      where: {
        post: { userId },
        status: { in: [PublishStatus.PUBLISHED, PublishStatus.FAILED] },
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      select: {
        platform: true,
        status: true,
        error: true,
        publishedAt: true,
        retryCount: true,
        post: {
          select: { scheduledAt: true },
        },
      },
    });

    const platforms = computePlatformReliability(results);

    const totalPublished = results.filter(
      (r) => r.status === PublishStatus.PUBLISHED
    ).length;
    const totalFailed = results.filter(
      (r) => r.status === PublishStatus.FAILED
    ).length;
    const totalAttempts = totalPublished + totalFailed;
    const overallSuccessRate =
      totalAttempts > 0
        ? Math.round((totalPublished / totalAttempts) * 100)
        : 0;

    return NextResponse.json({
      period,
      platforms,
      overallSuccessRate,
      totalPublished,
      totalFailed,
    } satisfies PublishReliabilityResponse);
  } catch (err) {
    return handleRouteError(err);
  }
}
