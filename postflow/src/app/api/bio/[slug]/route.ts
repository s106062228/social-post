import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";

// ── GET /api/bio/[slug] ───────────────────────────────────────────────────────
// Public endpoint — no auth required

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  try {
    const { slug } = await params;

    const page = await prisma.linkBioPage.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        title: true,
        bio: true,
        isPublished: true,
        items: {
          where: { isActive: true },
          orderBy: { order: "asc" },
          select: {
            id: true,
            label: true,
            url: true,
            icon: true,
            order: true,
            clicks: true,
          },
        },
      },
    });

    if (!page || !page.isPublished) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ page });
  } catch (err) {
    return handleRouteError(err);
  }
}
