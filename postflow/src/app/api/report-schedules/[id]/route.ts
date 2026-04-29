import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { computeNextSendAt } from "../route";

// ── DELETE /api/report-schedules/[id] ────────────────────────────────────────

export async function DELETE(
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

    const schedule = await prisma.reportSchedule.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!schedule) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (schedule.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.reportSchedule.delete({ where: { id } });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── PATCH /api/report-schedules/[id]/toggle ───────────────────────────────────
// Implemented inline here via a sub-route; toggle is handled in toggle/route.ts
// This file also handles PATCH for toggling active state.

export async function PATCH(
  request: NextRequest,
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

    const schedule = await prisma.reportSchedule.findUnique({
      where: { id },
      select: { userId: true, isActive: true, frequency: true },
    });

    if (!schedule) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (schedule.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    void request; // body not needed for toggle

    const newActive = !schedule.isActive;
    const updated = await prisma.reportSchedule.update({
      where: { id },
      data: {
        isActive: newActive,
        // Reset nextSendAt when re-activating so it doesn't fire immediately
        ...(newActive && { nextSendAt: computeNextSendAt(schedule.frequency) }),
      },
      select: {
        id: true,
        frequency: true,
        recipientEmail: true,
        isActive: true,
        lastSentAt: true,
        nextSendAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleRouteError(err);
  }
}
