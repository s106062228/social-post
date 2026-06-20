import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PublishStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const VALID_METRICS = ["score", "likes", "comments", "shares", "reach"] as const;
type MetricKey = (typeof VALID_METRICS)[number];

const querySchema = z.object({
  year: z
    .string()
    .regex(/^\d{4}$/)
    .transform(Number)
    .refine((y) => y >= 2020 && y <= 2100)
    .optional(),
  metric: z.enum(VALID_METRICS).optional(),
});

export interface PerformanceHeatmapDay {
  date: string;
  value: number;
  postCount: number;
}

export interface PerformanceHeatmapResponse {
  year: number;
  metric: MetricKey;
  totalDays: number;
  maxValue: number;
  days: PerformanceHeatmapDay[];
}

function computeScore(
  likes: number,
  comments: number,
  shares: number,
  reach: number,
  impressions: number
): number {
  return likes * 3 + comments * 5 + shares * 4 + reach * 1 + impressions * 0.5;
}

function getMetricValue(
  metric: MetricKey,
  insight: {
    impressions: number | null;
    reach: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
  }
): number {
  const likes = insight.likes ?? 0;
  const comments = insight.comments ?? 0;
  const shares = insight.shares ?? 0;
  const reach = insight.reach ?? 0;
  const impressions = insight.impressions ?? 0;

  switch (metric) {
    case "score":
      return computeScore(likes, comments, shares, reach, impressions);
    case "likes":
      return likes;
    case "comments":
      return comments;
    case "shares":
      return shares;
    case "reach":
      return reach;
  }
}

// ── GET /api/analytics/performance-heatmap ───────────────────────────────────

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
      year: request.nextUrl.searchParams.get("year") ?? undefined,
      metric: request.nextUrl.searchParams.get("metric") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const year = parsed.data.year ?? new Date().getFullYear();
    const metric: MetricKey = parsed.data.metric ?? "score";
    const userId = session.user.id;

    const yearStart = new Date(`${year}-01-01T00:00:00.000Z`);
    const yearEnd = new Date(`${year + 1}-01-01T00:00:00.000Z`);

    // Query PUBLISHED publish results within the year, joined to insights
    const results = await prisma.publishResult.findMany({
      where: {
        status: PublishStatus.PUBLISHED,
        publishedAt: { gte: yearStart, lt: yearEnd },
        post: { userId },
      },
      select: {
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

    // Accumulate sum and count per date
    const valuesByDate = new Map<string, { sum: number; count: number }>();

    for (const result of results) {
      if (!result.publishedAt) continue;
      const key = result.publishedAt.toISOString().slice(0, 10);

      if (!valuesByDate.has(key)) {
        valuesByDate.set(key, { sum: 0, count: 0 });
      }
      const entry = valuesByDate.get(key)!;
      entry.count += 1;

      // Each result may have one or zero insights
      if (result.insights) {
        entry.sum += getMetricValue(metric, result.insights);
      }
    }

    // Build a full 365/366-day array
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const totalDays = isLeap ? 366 : 365;

    const days: PerformanceHeatmapDay[] = [];
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(yearStart);
      d.setUTCDate(d.getUTCDate() + i);
      const key = d.toISOString().slice(0, 10);
      const entry = valuesByDate.get(key);
      const postCount = entry?.count ?? 0;
      const value = postCount > 0 ? entry!.sum / postCount : 0;
      days.push({ date: key, value, postCount });
    }

    const maxValue = days.reduce((m, d) => Math.max(m, d.value), 0);

    return NextResponse.json({
      year,
      metric,
      totalDays,
      maxValue,
      days,
    } satisfies PerformanceHeatmapResponse);
  } catch (err) {
    return handleRouteError(err);
  }
}
