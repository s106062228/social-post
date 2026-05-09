import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const MAX_ITEMS = 30;

const createItemSchema = z.object({
  label: z.string().min(1).max(100),
  url: z.string().url().max(2048),
  icon: z.string().max(50).optional().nullable(),
  order: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

// ── POST /api/bio-pages/[id]/items ────────────────────────────────────────────

export async function POST(
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
    const page = await prisma.linkBioPage.findUnique({ where: { id } });
    if (!page) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }
    if (page.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const itemCount = await prisma.linkBioItem.count({ where: { pageId: id } });
    if (itemCount >= MAX_ITEMS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_ITEMS} items per page` },
        { status: 422 }
      );
    }

    const body = await request.json();
    const parsed = createItemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const order =
      parsed.data.order ??
      (await prisma.linkBioItem.count({ where: { pageId: id } }));

    const item = await prisma.linkBioItem.create({
      data: {
        pageId: id,
        label: parsed.data.label,
        url: parsed.data.url,
        icon: parsed.data.icon ?? null,
        order,
        isActive: parsed.data.isActive ?? true,
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

    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
