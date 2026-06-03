import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Platform } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const MAX_DISCLAIMERS = 20;

const createSchema = z.object({
  name: z.string().min(1).max(100),
  content: z.string().min(1).max(5000),
  platforms: z.array(z.nativeEnum(Platform)).optional().default([]),
  position: z.enum(["append", "prepend"]).default("append"),
  autoAppend: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

// ── GET /api/legal-disclaimers ────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
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

    const disclaimers = await prisma.legalDisclaimer.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ disclaimers });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/legal-disclaimers ───────────────────────────────────────────────

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

    const count = await prisma.legalDisclaimer.count({
      where: { userId: session.user.id },
    });
    if (count >= MAX_DISCLAIMERS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_DISCLAIMERS} disclaimers per user` },
        { status: 422 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const disclaimer = await prisma.legalDisclaimer.create({
      data: {
        userId: session.user.id,
        ...parsed.data,
      },
    });

    return NextResponse.json({ disclaimer }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
