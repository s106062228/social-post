import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

// ── DELETE /api/posting-goals/[id] ───────────────────────────────────────────

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

    const goal = await prisma.postingGoal.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!goal) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (goal.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.postingGoal.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── PATCH /api/posting-goals/[id]/toggle ─────────────────────────────────────
// Handled in /api/posting-goals/[id]/toggle/route.ts
