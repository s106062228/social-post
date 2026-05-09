import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const updateItemSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  url: z.string().url().max(2048).optional(),
  icon: z.string().max(50).nullable().optional(),
  order: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

async function resolveOwnership(
  pageId: string,
  itemId: string,
  userId: string
): Promise<{ ok: true } | NextResponse> {
  const page = await prisma.linkBioPage.findUnique({ where: { id: pageId } });
  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }
  if (page.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const item = await prisma.linkBioItem.findUnique({ where: { id: itemId } });
  if (!item || item.pageId !== pageId) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }
  return { ok: true };
}

// ── PATCH /api/bio-pages/[id]/items/[itemId] ──────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
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

    const { id, itemId } = await params;
    const ownership = await resolveOwnership(id, itemId, session.user.id);
    if (ownership instanceof NextResponse) return ownership;

    const body = await request.json();
    const parsed = updateItemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const item = await prisma.linkBioItem.update({
      where: { id: itemId },
      data: {
        ...(parsed.data.label !== undefined && { label: parsed.data.label }),
        ...(parsed.data.url !== undefined && { url: parsed.data.url }),
        ...(parsed.data.icon !== undefined && { icon: parsed.data.icon }),
        ...(parsed.data.order !== undefined && { order: parsed.data.order }),
        ...(parsed.data.isActive !== undefined && {
          isActive: parsed.data.isActive,
        }),
      },
      select: {
        id: true,
        label: true,
        url: true,
        icon: true,
        order: true,
        isActive: true,
        clicks: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ item });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── DELETE /api/bio-pages/[id]/items/[itemId] ─────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
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

    const { id, itemId } = await params;
    const ownership = await resolveOwnership(id, itemId, session.user.id);
    if (ownership instanceof NextResponse) return ownership;

    await prisma.linkBioItem.delete({ where: { id: itemId } });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
