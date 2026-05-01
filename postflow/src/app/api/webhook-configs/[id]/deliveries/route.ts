import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

type RouteContext = { params: Promise<{ id: string }> };

// ── GET /api/webhook-configs/[id]/deliveries ──────────────────────────────────

export async function GET(
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

    const config = await prisma.webhookConfig.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!config || config.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const deliveries = await prisma.webhookDelivery.findMany({
      where: { configId: id },
      orderBy: { attemptedAt: "desc" },
      take: 50,
      select: {
        id: true,
        event: true,
        statusCode: true,
        success: true,
        durationMs: true,
        attemptedAt: true,
      },
    });

    return NextResponse.json({ deliveries });
  } catch (err) {
    return handleRouteError(err);
  }
}
