import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

type RouteContext = { params: Promise<{ id: string }> };

// ── DELETE /api/webhook-configs/[id] ─────────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: RouteContext
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
    if (!id || id.length < 10) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const config = await prisma.webhookConfig.findUnique({ where: { id } });
    if (!config || config.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.webhookConfig.delete({ where: { id } });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── PATCH /api/webhook-configs/[id]/toggle ────────────────────────────────────
// Note: toggle is handled in /api/webhook-configs/[id]/toggle/route.ts
