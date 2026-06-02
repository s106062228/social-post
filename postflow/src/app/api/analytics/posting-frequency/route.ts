import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PublishStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import {
  computePlatformFrequency,
  type PlatformFrequencyData,
} from "@/lib/posting-frequency";

const PERIOD_DAYS: Record<string, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const querySchema = z.object({
  period: z.enum(["7d", "30d", "90d"]).default("30d"),
});

export type { PlatformFrequencyData };

export interface PostingFrequencyResponse {
  period: string;
  platforms: PlatformFrequencyData[];
  overallPacingScore: number;
  totalPublished: number;
}

// ── GET /api/analytics/posting-frequency ──────────────────────────────────────

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
    const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

    const results = await prisma.publishResult.findMany({
      where: {
        post: { userId },
        status: PublishStatus.PUBLISHED,
        publishedAt: { gte: since },
      },
      select: { platform: true },
    });

    const platforms = computePlatformFrequency(results, daysBack);

    const totalPublished = results.length;
    const overallPacingScore =
      platforms.length > 0
        ? Math.round(
            platforms.reduce((sum, p) => sum + p.pacingScore, 0) /
              platforms.length
          )
        : 0;

    return NextResponse.json({
      period,
      platforms,
      overallPacingScore,
      totalPublished,
    } satisfies PostingFrequencyResponse);
  } catch (err) {
    return handleRouteError(err);
  }
}
