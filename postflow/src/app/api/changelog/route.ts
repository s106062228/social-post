import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

// ── GET /api/changelog ──────────────────────────────────────────────────────────
// Returns published changelog entries sorted by publishedAt desc,
// with a `seen` boolean per entry based on UserChangelogView records.

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

    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20)
    );

    const [entries, userViews] = await Promise.all([
      prisma.changelogEntry.findMany({
        where: { isPublished: true },
        orderBy: { publishedAt: "desc" },
        take: limit,
        select: {
          id: true,
          title: true,
          summary: true,
          body: true,
          type: true,
          version: true,
          publishedAt: true,
        },
      }),
      prisma.userChangelogView.findMany({
        where: { userId: session.user.id },
        select: { entryId: true },
      }),
    ]);

    const seenIds = new Set(userViews.map((v) => v.entryId));

    const result = entries.map((entry) => ({
      ...entry,
      seen: seenIds.has(entry.id),
    }));

    const unseenCount = result.filter((e) => !e.seen).length;

    return NextResponse.json(
      { entries: result, unseenCount },
      { headers: rateLimitHeaders(rl) }
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
