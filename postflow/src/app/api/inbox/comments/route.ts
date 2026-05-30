import { type NextRequest, NextResponse } from "next/server";
import { Platform } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const rl = await apiLimiter(userId, { limit: 60, windowMs: 60_000 });
  if (!rl.success) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const platform = searchParams.get("platform") as Platform | null;
    const unreadOnly = searchParams.get("unreadOnly") === "true";
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);
    const cursor = searchParams.get("cursor") ?? undefined;

    const where = {
      userId,
      ...(platform && Object.values(Platform).includes(platform)
        ? { platform }
        : {}),
      ...(unreadOnly ? { isRead: false } : {}),
    };

    const [comments, totalUnread] = await Promise.all([
      prisma.socialComment.findMany({
        where: {
          ...where,
          ...(cursor ? { id: { lt: cursor } } : {}),
        },
        orderBy: { postedAt: "desc" },
        take: limit + 1,
      }),
      prisma.socialComment.count({ where: { userId, isRead: false } }),
    ]);

    const hasMore = comments.length > limit;
    const items = hasMore ? comments.slice(0, limit) : comments;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

    return NextResponse.json({
      comments: items,
      nextCursor,
      totalUnread,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
