import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-log";
import { findNextAvailableSlot } from "@/lib/queue-slots";
import { PostStatus } from "@prisma/client";

// ── POST /api/posts/[id]/queue ────────────────────────────────────────────────
// Assigns a DRAFT post to the next available queue slot.

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

    const post = await prisma.post.findUnique({
      where: { id },
      select: { userId: true, status: true },
    });

    if (!post) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (post.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (post.status !== PostStatus.DRAFT) {
      return NextResponse.json(
        { error: "Only DRAFT posts can be added to the queue" },
        { status: 409 }
      );
    }

    // Look up user's timezone preference
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { timezone: true },
    });

    const timezone = user?.timezone ?? "UTC";

    const nextSlot = await findNextAvailableSlot(session.user.id, timezone);

    if (!nextSlot) {
      return NextResponse.json(
        { error: "No available queue slots found. Add posting time windows first." },
        { status: 422 }
      );
    }

    const updated = await prisma.post.update({
      where: { id },
      data: {
        scheduledAt: nextSlot,
        status: PostStatus.SCHEDULED,
      },
      select: {
        id: true,
        status: true,
        scheduledAt: true,
      },
    });

    void logActivity({
      userId: session.user.id,
      action: "post.queued",
      entityId: id,
      entityType: "post",
      metadata: { scheduledAt: nextSlot.toISOString() },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleRouteError(err);
  }
}
