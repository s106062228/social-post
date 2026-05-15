import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { Platform } from "@prisma/client";

const patchSchema = z.object({
  notes: z.string().max(5000).optional().nullable(),
  platform: z.nativeEnum(Platform).optional().nullable(),
  title: z.string().max(500).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
});

// ── PATCH /api/inspiration/[id] ───────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", issues: parsed.error.issues },
        { status: 422 }
      );
    }

    const { id } = await params;

    const existing = await prisma.inspirationItem.findUnique({ where: { id } });
    if (!existing || existing.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const item = await prisma.inspirationItem.update({
      where: { id },
      data: {
        ...(parsed.data.notes !== undefined && { notes: parsed.data.notes }),
        ...(parsed.data.platform !== undefined && { platform: parsed.data.platform }),
        ...(parsed.data.title !== undefined && { title: parsed.data.title }),
        ...(parsed.data.description !== undefined && { description: parsed.data.description }),
      },
      select: {
        id: true,
        url: true,
        title: true,
        description: true,
        imageUrl: true,
        notes: true,
        platform: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ item });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── DELETE /api/inspiration/[id] ──────────────────────────────────────────────

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

    const existing = await prisma.inspirationItem.findUnique({ where: { id } });
    if (!existing || existing.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.inspirationItem.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
