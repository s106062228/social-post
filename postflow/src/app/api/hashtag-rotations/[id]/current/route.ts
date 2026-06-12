import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

// ── GET /api/hashtag-rotations/[id]/current ───────────────────────────────────

export async function GET(
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

    const rotation = await prisma.hashtagRotation.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!rotation) {
      return NextResponse.json({ error: "Rotation not found" }, { status: 404 });
    }

    if (rotation.groupIds.length === 0) {
      return NextResponse.json(
        { error: "Rotation has no hashtag groups" },
        { status: 404 }
      );
    }

    const currentGroupId = rotation.groupIds[rotation.currentIndex] ?? rotation.groupIds[0];
    const group = await prisma.hashtagGroup.findFirst({
      where: { id: currentGroupId, userId: session.user.id },
      select: { id: true, name: true, hashtags: true },
    });

    if (!group) {
      return NextResponse.json(
        { error: "Current hashtag group not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      currentIndex: rotation.currentIndex,
      totalGroups: rotation.groupIds.length,
      group,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
