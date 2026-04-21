import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { calcNextRunAt } from "@/lib/queue/scheduler";

// ── POST /api/schedules/[id]/toggle ──────────────────────────────────────────

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

    const schedule = await prisma.recurringSchedule.findUnique({
      where: { id },
    });

    if (!schedule) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    if (schedule.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const newIsActive = !schedule.isActive;

    // Recalculate nextRunAt when re-activating
    const nextRunAt = newIsActive
      ? calcNextRunAt(schedule.cronExpr, schedule.timezone)
      : null;

    const updated = await prisma.recurringSchedule.update({
      where: { id },
      data: { isActive: newIsActive, nextRunAt },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleRouteError(err);
  }
}
