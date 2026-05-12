import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// ── GET /s/[slug] — public short link redirect ────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  const { slug } = await params;

  const link = await prisma.shortLink.findUnique({ where: { slug } });

  if (!link) {
    return new NextResponse("Not found", { status: 404 });
  }

  if (link.expiresAt && link.expiresAt < new Date()) {
    return new NextResponse("Link expired", { status: 410 });
  }

  // Increment click count fire-and-forget
  void prisma.shortLink
    .update({
      where: { id: link.id },
      data: { clicks: { increment: 1 } },
    })
    .catch(() => undefined);

  return NextResponse.redirect(link.originalUrl, { status: 302 });
}
