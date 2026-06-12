import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";

// ── POST /api/affiliate-links/[id]/track-click (public) ──────────────────────

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;

    const existing = await prisma.affiliateLink.findUnique({ where: { id } });
    if (!existing || !existing.isActive) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const link = await prisma.affiliateLink.update({
      where: { id },
      data: { clicks: { increment: 1 } },
      select: { clicks: true },
    });

    return NextResponse.json({ clicks: link.clicks });
  } catch (err) {
    return handleRouteError(err);
  }
}
