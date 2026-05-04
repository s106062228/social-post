import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { GoalPeriod, Platform } from "@prisma/client";

const MAX_GOALS = 20;

const createSchema = z.object({
  name: z.string().min(1).max(100),
  targetCount: z.number().int().min(1).max(10000),
  period: z.nativeEnum(GoalPeriod),
  platform: z.nativeEnum(Platform).optional().nullable(),
});

// ── GET /api/posting-goals ────────────────────────────────────────────────────

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

    const goals = await prisma.postingGoal.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        targetCount: true,
        period: true,
        platform: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ goals });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/posting-goals ───────────────────────────────────────────────────

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

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const count = await prisma.postingGoal.count({
      where: { userId: session.user.id },
    });
    if (count >= MAX_GOALS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_GOALS} posting goals allowed` },
        { status: 422 }
      );
    }

    const goal = await prisma.postingGoal.create({
      data: {
        userId: session.user.id,
        name: parsed.data.name,
        targetCount: parsed.data.targetCount,
        period: parsed.data.period,
        platform: parsed.data.platform ?? null,
      },
      select: {
        id: true,
        name: true,
        targetCount: true,
        period: true,
        platform: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ goal }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
