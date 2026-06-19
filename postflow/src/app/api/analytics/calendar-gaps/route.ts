import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PostStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { detectCalendarGaps } from "@/lib/calendar-gaps";

const querySchema = z.object({
  windowDays: z.coerce.number().int().min(1).max(60).default(14),
});

// ── GET /api/analytics/calendar-gaps ─────────────────────────────────────────

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
      windowDays: request.nextUrl.searchParams.get("windowDays") ?? "14",
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { windowDays } = parsed.data;
    const userId = session.user.id;

    // Window: tomorrow UTC to tomorrow + windowDays
    const tomorrow = new Date();
    tomorrow.setUTCHours(0, 0, 0, 0);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    const windowEnd = new Date(tomorrow);
    windowEnd.setUTCDate(windowEnd.getUTCDate() + windowDays);

    const scheduledPosts = await prisma.post.findMany({
      where: {
        userId,
        status: PostStatus.SCHEDULED,
        scheduledAt: {
          gte: tomorrow,
          lt: windowEnd,
        },
      },
      select: { scheduledAt: true },
    });

    const result = detectCalendarGaps(scheduledPosts, windowDays);

    return NextResponse.json({ windowDays, ...result });
  } catch (err) {
    return handleRouteError(err);
  }
}
