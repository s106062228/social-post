import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";

// ── POST /api/bio/[slug]/click/[itemId] ───────────────────────────────────────
// Public endpoint — no auth required; increments click counter

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string; itemId: string }> }
): Promise<NextResponse> {
  try {
    const { slug, itemId } = await params;

    const page = await prisma.linkBioPage.findUnique({ where: { slug } });
    if (!page || !page.isPublished) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const item = await prisma.linkBioItem.findUnique({ where: { id: itemId } });
    if (!item || item.pageId !== page.id) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    await prisma.linkBioItem.update({
      where: { id: itemId },
      data: { clicks: { increment: 1 } },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
