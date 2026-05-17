import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PostStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const querySchema = z.object({
  year: z
    .string()
    .regex(/^\d{4}$/)
    .transform(Number)
    .refine((y) => y >= 2020 && y <= 2100)
    .optional(),
});

export interface HeatmapDay {
  date: string;
  count: number;
}

export interface HeatmapResponse {
  year: number;
  totalPosts: number;
  maxDay: number;
  days: HeatmapDay[];
}

// ── GET /api/analytics/heatmap ────────────────────────────────────────────────

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
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const year = parsed.data.year ?? new Date().getFullYear();
    const userId = session.user.id;

    const yearStart = new Date(`${year}-01-01T00:00:00.000Z`);
    const yearEnd = new Date(`${year + 1}-01-01T00:00:00.000Z`);

    const posts = await prisma.post.findMany({
      where: {
        userId,
        status: { in: [PostStatus.PUBLISHED, PostStatus.SCHEDULED] },
        OR: [
          {
            status: PostStatus.PUBLISHED,
            updatedAt: { gte: yearStart, lt: yearEnd },
          },
          {
            status: PostStatus.SCHEDULED,
            scheduledAt: { gte: yearStart, lt: yearEnd },
          },
        ],
      },
      select: {
        status: true,
        updatedAt: true,
        scheduledAt: true,
      },
    });

    // Count posts per ISO date string
    const countByDate = new Map<string, number>();
    for (const post of posts) {
      const d =
        post.status === PostStatus.PUBLISHED
          ? post.updatedAt
          : (post.scheduledAt ?? post.updatedAt);
      const key = d.toISOString().slice(0, 10);
      countByDate.set(key, (countByDate.get(key) ?? 0) + 1);
    }

    // Build a full 365/366-day array for the year
    const days: HeatmapDay[] = [];
    const isLeap =
      (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const totalDays = isLeap ? 366 : 365;

    for (let i = 0; i < totalDays; i++) {
      const d = new Date(yearStart);
      d.setUTCDate(d.getUTCDate() + i);
      const key = d.toISOString().slice(0, 10);
      days.push({ date: key, count: countByDate.get(key) ?? 0 });
    }

    const totalPosts = days.reduce((s, d) => s + d.count, 0);
    const maxDay = days.reduce((m, d) => Math.max(m, d.count), 0);

    return NextResponse.json({
      year,
      totalPosts,
      maxDay,
      days,
    } satisfies HeatmapResponse);
  } catch (err) {
    return handleRouteError(err);
  }
}
