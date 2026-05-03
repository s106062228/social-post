import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AlertMetric, AlertOperator, Platform } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const VALID_PERIODS = ["7d", "30d"] as const;
const MAX_ALERTS = 20;

const createAlertSchema = z.object({
  name: z.string().min(1).max(100),
  metric: z.nativeEnum(AlertMetric),
  operator: z.nativeEnum(AlertOperator),
  threshold: z.number().min(0),
  platform: z.nativeEnum(Platform).optional(),
  period: z.enum(VALID_PERIODS).default("7d"),
});

// ── GET /api/performance-alerts ───────────────────────────────────────────────

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

    const alerts = await prisma.performanceAlert.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        metric: true,
        operator: true,
        threshold: true,
        platform: true,
        period: true,
        isActive: true,
        lastTriggeredAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ alerts });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/performance-alerts ──────────────────────────────────────────────

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

    const parsed = createAlertSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const count = await prisma.performanceAlert.count({
      where: { userId: session.user.id },
    });
    if (count >= MAX_ALERTS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_ALERTS} performance alerts allowed` },
        { status: 422 }
      );
    }

    const alert = await prisma.performanceAlert.create({
      data: {
        userId: session.user.id,
        name: parsed.data.name.trim(),
        metric: parsed.data.metric,
        operator: parsed.data.operator,
        threshold: parsed.data.threshold,
        platform: parsed.data.platform ?? null,
        period: parsed.data.period,
      },
      select: {
        id: true,
        name: true,
        metric: true,
        operator: true,
        threshold: true,
        platform: true,
        period: true,
        isActive: true,
        lastTriggeredAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json(alert, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
