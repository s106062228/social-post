import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { MediaType, Platform } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { sanitizePostContent } from "@/lib/sanitize";
import { calcNextRunAt, isValidCronExpr } from "@/lib/queue/scheduler";

// ── Zod Schemas ───────────────────────────────────────────────────────────────

const createScheduleSchema = z.object({
  name: z.string().min(1).max(100),
  content: z.string().min(1).max(63206),
  mediaType: z.nativeEnum(MediaType).default(MediaType.NONE),
  mediaUrls: z.array(z.string().url()).default([]),
  platforms: z.array(z.nativeEnum(Platform)).min(1),
  cronExpr: z.string().min(1),
  timezone: z.string().default("UTC"),
});

const listSchedulesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// ── GET /api/schedules ────────────────────────────────────────────────────────

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

    const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = listSchedulesSchema.safeParse(searchParams);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { page, limit } = parsed.data;
    const skip = (page - 1) * limit;

    const [schedules, total] = await Promise.all([
      prisma.recurringSchedule.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          content: true,
          mediaType: true,
          mediaUrls: true,
          platforms: true,
          cronExpr: true,
          timezone: true,
          isActive: true,
          lastRunAt: true,
          nextRunAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.recurringSchedule.count({ where: { userId: session.user.id } }),
    ]);

    return NextResponse.json({
      schedules,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/schedules ───────────────────────────────────────────────────────

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

    const parsed = createScheduleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { name, mediaType, mediaUrls, platforms, cronExpr, timezone } = parsed.data;
    const content = sanitizePostContent(parsed.data.content);

    if (content.length === 0) {
      return NextResponse.json(
        { error: "Validation failed", issues: { content: ["Content cannot be empty after sanitization"] } },
        { status: 400 }
      );
    }

    if (!isValidCronExpr(cronExpr)) {
      return NextResponse.json(
        { error: "Validation failed", issues: { cronExpr: ["Invalid cron expression"] } },
        { status: 400 }
      );
    }

    const nextRunAt = calcNextRunAt(cronExpr, timezone);

    const schedule = await prisma.recurringSchedule.create({
      data: {
        userId: session.user.id,
        name,
        content,
        mediaType,
        mediaUrls,
        platforms,
        cronExpr,
        timezone,
        nextRunAt,
      },
    });

    return NextResponse.json(schedule, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
