import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { IdeaStatus, Platform } from "@prisma/client";

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  status: z.nativeEnum(IdeaStatus).optional(),
  platform: z.nativeEnum(Platform).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
});

// ── GET /api/ideas ────────────────────────────────────────────────────────────

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

    const ideas = await prisma.contentIdea.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        platform: true,
        notes: true,
        dueDate: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ ideas });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/ideas ───────────────────────────────────────────────────────────

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

    const { title, description, status, platform, notes, dueDate } = parsed.data;

    const idea = await prisma.contentIdea.create({
      data: {
        userId: session.user.id,
        title: title.trim(),
        description: description?.trim() ?? null,
        status: status ?? IdeaStatus.IDEA,
        platform: platform ?? null,
        notes: notes?.trim() ?? null,
        dueDate: dueDate ? new Date(dueDate) : null,
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        platform: true,
        notes: true,
        dueDate: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(idea, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
