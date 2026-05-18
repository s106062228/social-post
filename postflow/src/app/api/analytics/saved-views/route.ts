import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const MAX_SAVED_VIEWS = 20;

const createSchema = z.object({
  name: z.string().min(1).max(100),
  reportType: z.string().min(1).max(50),
  config: z.record(z.string(), z.any()),
});

// ── GET /api/analytics/saved-views ───────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
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

    const views = await prisma.savedAnalyticsView.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        reportType: true,
        config: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ views });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/analytics/saved-views ──────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
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

    const body: unknown = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const count = await prisma.savedAnalyticsView.count({
      where: { userId: session.user.id },
    });
    if (count >= MAX_SAVED_VIEWS) {
      return NextResponse.json(
        { error: `Maximum of ${MAX_SAVED_VIEWS} saved views reached` },
        { status: 422 }
      );
    }

    const view = await prisma.savedAnalyticsView.create({
      data: {
        userId: session.user.id,
        name: parsed.data.name,
        reportType: parsed.data.reportType,
        config: parsed.data.config,
      },
      select: {
        id: true,
        name: true,
        reportType: true,
        config: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ view }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
