import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const DEFAULT_CONFIG = {
  enabled: false,
  dayOfWeek: 1, // Monday
  hourUTC: 9,
  lookAheadDays: 7,
  includeContent: true,
};

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  hourUTC: z.number().int().min(0).max(23).optional(),
  lookAheadDays: z.number().int().min(1).max(30).optional(),
  includeContent: z.boolean().optional(),
});

// ── GET /api/settings/content-digest ─────────────────────────────────────────

export async function GET(_request: NextRequest): Promise<NextResponse> {
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

    const config = await prisma.contentDigestConfig.findUnique({
      where: { userId: session.user.id },
      select: {
        enabled: true,
        dayOfWeek: true,
        hourUTC: true,
        lookAheadDays: true,
        includeContent: true,
      },
    });

    return NextResponse.json(config ?? DEFAULT_CONFIG);
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── PATCH /api/settings/content-digest ───────────────────────────────────────

export async function PATCH(request: NextRequest): Promise<NextResponse> {
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
    const result = updateSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: result.error.flatten() },
        { status: 400 }
      );
    }

    const data = result.data;

    const config = await prisma.contentDigestConfig.upsert({
      where: { userId: session.user.id },
      update: data,
      create: {
        userId: session.user.id,
        ...DEFAULT_CONFIG,
        ...data,
      },
      select: {
        enabled: true,
        dayOfWeek: true,
        hourUTC: true,
        lookAheadDays: true,
        includeContent: true,
      },
    });

    return NextResponse.json(config);
  } catch (err) {
    return handleRouteError(err);
  }
}
