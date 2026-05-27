import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import {
  GoalPeriod,
  Platform,
  EngagementMetric,
  EngagementAggregation,
} from "@prisma/client";

const MAX_ENGAGEMENT_GOALS = 20;

const createSchema = z.object({
  name: z.string().min(1).max(100),
  metric: z.nativeEnum(EngagementMetric),
  targetValue: z.number().min(0.01).max(10_000_000),
  aggregation: z.nativeEnum(EngagementAggregation).optional().default(EngagementAggregation.AVERAGE),
  period: z.nativeEnum(GoalPeriod),
  platform: z.nativeEnum(Platform).optional().nullable(),
});

// ── GET /api/engagement-goals ─────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
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

    const goals = await prisma.engagementGoal.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        metric: true,
        targetValue: true,
        aggregation: true,
        period: true,
        platform: true,
        isActive: true,
        lastNotifiedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ goals });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/engagement-goals ────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
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

    const count = await prisma.engagementGoal.count({
      where: { userId: session.user.id },
    });
    if (count >= MAX_ENGAGEMENT_GOALS) {
      return NextResponse.json(
        { error: `Maximum of ${MAX_ENGAGEMENT_GOALS} engagement goals reached` },
        { status: 422 }
      );
    }

    const body: unknown = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, metric, targetValue, aggregation, period, platform } = parsed.data;

    const goal = await prisma.engagementGoal.create({
      data: {
        userId: session.user.id,
        name,
        metric,
        targetValue,
        aggregation,
        period,
        platform: platform ?? null,
      },
      select: {
        id: true,
        name: true,
        metric: true,
        targetValue: true,
        aggregation: true,
        period: true,
        platform: true,
        isActive: true,
        lastNotifiedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ goal }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
