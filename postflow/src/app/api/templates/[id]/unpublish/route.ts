import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

// ── POST /api/templates/[id]/unpublish ───────────────────────────────────────

export async function POST(
  _request: NextRequest,
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

    const updated = await prisma.template.update({
      where: { id },
      data: { marketplacePublished: false },
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
