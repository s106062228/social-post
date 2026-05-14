import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { isInBlackout } from "@/lib/blackout";

const idSchema = z.string().cuid();

// ── POST /api/posts/[id]/check-blackout ───────────────────────────────────────────────
// Returns {blocked: boolean, periodName?: string} for the post's scheduledAt.

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
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

    const { id } = await params;
    const parsed = idSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const post = await prisma.post.findUnique({
      where: { id: parsed.data },
      select: { userId: true, scheduledAt: true },
    });

    if (!post) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (post.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!post.scheduledAt) {
      return NextResponse.json({ blocked: false });
    }

    const blackouts = await prisma.blackoutPeriod.findMany({
      where: { userId: session.user.id },
      select: { name: true, startDate: true, endDate: true, isRecurring: true, daysOfWeek: true },
    });

    const match = isInBlackout(post.scheduledAt, blackouts);

    return NextResponse.json(
      match ? { blocked: true, periodName: match } : { blocked: false }
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
