import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const MAX_PILLARS = 20;

const createSchema = z.object({
  name: z.string().min(1).max(100),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color")
    .default("#6366f1"),
  description: z.string().max(500).optional(),
});

// ── GET /api/content-pillars ──────────────────────────────────────────────────

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

    const pillars = await prisma.contentPillar.findMany({
      where: { userId: session.user.id, isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        color: true,
        description: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { posts: true } },
      },
    });

    return NextResponse.json({ pillars });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/content-pillars ─────────────────────────────────────────────────

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

    const count = await prisma.contentPillar.count({
      where: { userId: session.user.id, isActive: true },
    });
    if (count >= MAX_PILLARS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_PILLARS} content pillars allowed` },
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

    const { name, color, description } = parsed.data;

    const pillar = await prisma.contentPillar.create({
      data: {
        userId: session.user.id,
        name: name.trim(),
        color,
        description: description?.trim() ?? null,
      },
      select: {
        id: true,
        name: true,
        color: true,
        description: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(pillar, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
