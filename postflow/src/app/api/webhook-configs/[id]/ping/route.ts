import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { deliverWebhook } from "@/lib/webhook-dispatch";

type RouteContext = { params: Promise<{ id: string }> };

// ── POST /api/webhook-configs/[id]/ping ──────────────────────────────────────

export async function POST(
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
      select: { userId: true, url: true, secret: true },
    });

    if (!config || config.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const result = await deliverWebhook(id, config.url, config.secret, {
      event: "ping",
      timestamp: new Date().toISOString(),
      data: { message: "Test ping from PostFlow" },
    });

    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
