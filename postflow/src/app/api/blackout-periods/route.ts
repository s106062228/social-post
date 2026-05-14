import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const MAX_BLACKOUT_PERIODS = 50;

const createSchema = z.object({
  name: z.string().min(1).max(100),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  isRecurring: z.boolean().default(false),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).default([]),
});

// ── GET /api/blackout-periods ─────────────────────────────────────────────

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

    const periods = await prisma.blackoutPeriod.findMany({
      where: { userId: session.user.id },
      orderBy: { startDate: "asc" },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        isRecurring: true,
        daysOfWeek: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ periods });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/blackout-periods ────────────────────────────────────────────

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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { name, startDate, endDate, isRecurring, daysOfWeek } = parsed.data;

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (end <= start) {
      return NextResponse.json(
        { error: "endDate must be after startDate" },
        { status: 400 }
      );
    }

    const count = await prisma.blackoutPeriod.count({
      where: { userId: session.user.id },
    });
    if (count >= MAX_BLACKOUT_PERIODS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_BLACKOUT_PERIODS} blackout periods allowed` },
        { status: 422 }
      );
    }

    const period = await prisma.blackoutPeriod.create({
      data: {
        userId: session.user.id,
        name: name.trim(),
        startDate: start,
        endDate: end,
        isRecurring,
        daysOfWeek: isRecurring ? daysOfWeek : [],
      },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        isRecurring: true,
        daysOfWeek: true,
        createdAt: true,
      },
    });

    return NextResponse.json(period, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
