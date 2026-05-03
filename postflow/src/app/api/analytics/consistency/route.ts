import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PostStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { computeConsistency, type ConsistencyResult } from "@/lib/consistency";

const querySchema = z.object({
  period: z.enum(["30d", "90d", "180d"]).default("30d"),
});

export interface ConsistencyResponse extends ConsistencyResult {
  period: string;
}

// ── GET /api/analytics/consistency ───────────────────────────────────────────

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
    const periodDays = period === "30d" ? 30 : period === "90d" ? 90 : 180;

    const since = new Date();
    since.setDate(since.getDate() - periodDays + 1);
    since.setHours(0, 0, 0, 0);

    const posts = await prisma.post.findMany({
      where: {
        userId,
        status: { in: [PostStatus.PUBLISHED, PostStatus.SCHEDULED] },
        OR: [
          { updatedAt: { gte: since } },
          { scheduledAt: { gte: since } },
        ],
      },
      select: {
        updatedAt: true,
        scheduledAt: true,
        status: true,
      },
    });

    // Use publishedAt (updatedAt for PUBLISHED) or scheduledAt for SCHEDULED
    const postDates = posts.map((p) =>
      p.status === PostStatus.PUBLISHED ? p.updatedAt : (p.scheduledAt ?? p.updatedAt)
    );

    const result = computeConsistency(postDates, periodDays);

    return NextResponse.json({
      ...result,
      period,
    } satisfies ConsistencyResponse);
  } catch (err) {
    return handleRouteError(err);
  }
}
