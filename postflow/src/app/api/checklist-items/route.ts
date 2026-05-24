import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const MAX_CHECKLIST_ITEMS = 20;

const createSchema = z.object({
  label: z.string().min(1).max(200),
  description: z.string().max(500).optional().nullable(),
  order: z.number().int().min(0).optional(),
});

// ── GET /api/checklist-items ──────────────────────────────────────────────────

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

    const items = await prisma.checklistItem.findMany({
      where: { userId: session.user.id },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        label: true,
        description: true,
        order: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ items });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/checklist-items ─────────────────────────────────────────────────

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

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const count = await prisma.checklistItem.count({
      where: { userId: session.user.id },
    });
    if (count >= MAX_CHECKLIST_ITEMS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_CHECKLIST_ITEMS} checklist items allowed` },
        { status: 422 }
      );
    }

    const item = await prisma.checklistItem.create({
      data: {
        userId: session.user.id,
        label: parsed.data.label,
        description: parsed.data.description ?? null,
        order: parsed.data.order ?? 0,
      },
      select: {
        id: true,
        label: true,
        description: true,
        order: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
