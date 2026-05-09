import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const updateSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  title: z.string().min(1).max(100).optional(),
  bio: z.string().max(500).nullable().optional(),
  isPublished: z.boolean().optional(),
});

// ── GET /api/bio-pages/[id] ───────────────────────────────────────────────────

export async function GET(
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
    const page = await prisma.linkBioPage.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        slug: true,
        title: true,
        bio: true,
        isPublished: true,
        createdAt: true,
        updatedAt: true,
        items: {
          orderBy: { order: "asc" },
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
        },
      },
    });

    if (!page) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (page.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ page });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── PATCH /api/bio-pages/[id] ─────────────────────────────────────────────────

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

    const { id } = await params;
    const existing = await prisma.linkBioPage.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (existing.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    if (parsed.data.slug && parsed.data.slug !== existing.slug) {
      const slugTaken = await prisma.linkBioPage.findUnique({
        where: { slug: parsed.data.slug },
      });
      if (slugTaken) {
        return NextResponse.json(
          { error: "Slug is already taken" },
          { status: 409 }
        );
      }
    }

    const page = await prisma.linkBioPage.update({
      where: { id },
      data: {
        ...(parsed.data.slug !== undefined && { slug: parsed.data.slug }),
        ...(parsed.data.title !== undefined && { title: parsed.data.title }),
        ...(parsed.data.bio !== undefined && { bio: parsed.data.bio }),
        ...(parsed.data.isPublished !== undefined && {
          isPublished: parsed.data.isPublished,
        }),
      },
      select: {
        id: true,
        slug: true,
        title: true,
        bio: true,
        isPublished: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { items: true } },
      },
    });

    return NextResponse.json({ page });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── DELETE /api/bio-pages/[id] ────────────────────────────────────────────────

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
    const existing = await prisma.linkBioPage.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (existing.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.linkBioPage.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
