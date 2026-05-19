import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Platform, PublishStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import {
  computeBenchmarkComparisons,
  PLATFORM_BENCHMARKS,
  type BenchmarkComparison,
} from "@/lib/engagement-benchmarks";

const platformValues = Object.values(Platform) as [string, ...string[]];

const querySchema = z.object({
  period: z.enum(["30d", "90d", "180d", "all"]).default("90d"),
  platform: z.enum(platformValues).optional(),
});

export interface BenchmarksResponse {
  period: string;
  comparisons: BenchmarkComparison[];
  benchmarkedPlatforms: Platform[];
}

// ── GET /api/analytics/benchmarks ────────────────────────────────────────────

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
      period: request.nextUrl.searchParams.get("period") ?? "90d",
      platform: request.nextUrl.searchParams.get("platform") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { period, platform } = parsed.data;
    const userId = session.user.id;

    const since =
      period === "all"
        ? undefined
        : (() => {
            const d = new Date();
            const days =
              period === "30d" ? 30 : period === "90d" ? 90 : 180;
            d.setDate(d.getDate() - days);
            return d;
          })();

    const platformFilter = platform as Platform | undefined;

    const rows = await prisma.publishResult.findMany({
      where: {
        post: { userId },
        status: PublishStatus.PUBLISHED,
        ...(platformFilter ? { platform: platformFilter } : {}),
        ...(since ? { publishedAt: { gte: since } } : {}),
      },
      select: {
        platform: true,
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

    const comparisons = computeBenchmarkComparisons(
      rows.map((r) => ({
        platform: r.platform as Platform,
        insights: r.insights,
      }))
    );

    const benchmarkedPlatforms = Object.keys(PLATFORM_BENCHMARKS) as Platform[];

    return NextResponse.json({
      period,
      comparisons,
      benchmarkedPlatforms,
    } satisfies BenchmarksResponse);
  } catch (err) {
    return handleRouteError(err);
  }
}
