import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

// ── POST /api/changelog/mark-seen ──────────────────────────────────────────────
// Upserts UserChangelogView rows for all unseen published entries.

export async function POST(): Promise<NextResponse> {
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

    // Fetch all published entries
    const publishedEntries = await prisma.changelogEntry.findMany({
      where: { isPublished: true },
      select: { id: true },
    });

    if (publishedEntries.length === 0) {
      return NextResponse.json({ marked: 0 }, { headers: rateLimitHeaders(rl) });
    }

    // Find which ones have already been seen
    const existingViews = await prisma.userChangelogView.findMany({
      where: {
        userId: session.user.id,
        entryId: { in: publishedEntries.map((e) => e.id) },
      },
      select: { entryId: true },
    });

    const alreadySeen = new Set(existingViews.map((v) => v.entryId));
    const unseenIds = publishedEntries
      .map((e) => e.id)
      .filter((id) => !alreadySeen.has(id));

    if (unseenIds.length === 0) {
      return NextResponse.json({ marked: 0 }, { headers: rateLimitHeaders(rl) });
    }

    // Upsert view records for all unseen entries
    await prisma.userChangelogView.createMany({
      data: unseenIds.map((entryId) => ({
        userId: session.user.id,
        entryId,
      })),
      skipDuplicates: true,
    });

    return NextResponse.json(
      { marked: unseenIds.length },
      { headers: rateLimitHeaders(rl) }
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
