import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const publishSchema = z.object({
  category: z.string().max(50).optional(),
  tags: z.array(z.string().max(30)).max(10).optional(),
});

// ── POST /api/templates/[id]/publish ─────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const rl = await apiLimiter.limit(userId);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    const { id } = await params;
    const template = await prisma.template.findUnique({ where: { id } });
    if (!template || template.userId !== userId) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    if (!template.content.trim()) {
      return NextResponse.json(
        { error: "Template content cannot be empty" },
        { status: 422 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = publishSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const { category, tags } = parsed.data;

    const updated = await prisma.template.update({
      where: { id },
      data: {
        marketplacePublished: true,
        ...(category !== undefined ? { marketplaceCategory: category } : {}),
        ...(tags !== undefined ? { marketplaceTags: tags } : {}),
      },
      select: {
        id: true,
        marketplacePublished: true,
        marketplaceCategory: true,
        marketplaceTags: true,
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleRouteError(err);
  }
}
