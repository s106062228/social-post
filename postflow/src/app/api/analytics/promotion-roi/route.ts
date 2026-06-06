import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import {
  computePlatformPromotionRoi,
  type PlatformPromotionRoi,
} from "@/lib/promotion-roi";

const PERIOD_DAYS: Record<string, number | null> = {
  "30d": 30,
  "90d": 90,
  all: null,
};

const querySchema = z.object({
  period: z.enum(["30d", "90d", "all"]).default("30d"),
});

export type { PlatformPromotionRoi };

export interface PromotionRoiResponse {
  period: string;
  platforms: PlatformPromotionRoi[];
  totalBudget: number;
  totalSpend: number;
  totalPromotions: number;
  activePromotions: number;
}

// ── GET /api/analytics/promotion-roi ──────────────────────────────────────────

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
    const since = daysBack !== null ? new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000) : null;

    const promotions = await prisma.postPromotion.findMany({
      where: {
        userId,
        ...(since !== null && { createdAt: { gte: since } }),
      },
      select: {
        platform: true,
        budget: true,
        spend: true,
        impressions: true,
        clicks: true,
        conversions: true,
        status: true,
      },
    });

    const platforms = computePlatformPromotionRoi(promotions);

    const totalBudget = promotions.reduce((sum, p) => sum + p.budget, 0);
    const totalSpend = promotions.reduce((sum, p) => sum + p.spend, 0);
    const activePromotions = promotions.filter((p) => p.status === "ACTIVE").length;

    return NextResponse.json({
      period,
      platforms,
      totalBudget,
      totalSpend,
      totalPromotions: promotions.length,
      activePromotions,
    } satisfies PromotionRoiResponse);
  } catch (err) {
    return handleRouteError(err);
  }
}
