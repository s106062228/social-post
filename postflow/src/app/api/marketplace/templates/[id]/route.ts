import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

// ── POST /api/marketplace/templates/[id]/import ──────────────────────────────

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

    const source = await prisma.template.findUnique({ where: { id } });
    if (!source || !source.marketplacePublished) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // Check if already imported
    const existing = await prisma.templateImport.findUnique({
      where: { userId_templateId: { userId, templateId: id } },
    });

    if (existing) {
      return NextResponse.json({
        templateId: id,
        alreadyImported: true,
        newTemplateId: null,
      });
    }

    // Create copy + record import in a transaction
    const [newTemplate] = await prisma.$transaction([
      prisma.template.create({
        data: {
          userId,
          name: source.name,
          content: source.content,
          mediaType: source.mediaType,
          mediaUrls: source.mediaUrls,
        },
      }),
      prisma.templateImport.create({
        data: { userId, templateId: id },
      }),
      prisma.template.update({
        where: { id },
        data: { importCount: { increment: 1 } },
      }),
    ]);

    return NextResponse.json({
      templateId: id,
      alreadyImported: false,
      newTemplateId: newTemplate.id,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
