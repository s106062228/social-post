import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

// ── POST /api/influencer-profiles/[id]/create-collaboration ──────────────────

export async function POST(
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

    const influencer = await prisma.influencerProfile.findUnique({
      where: { id },
    });
    if (!influencer) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (influencer.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [collaboration] = await prisma.$transaction([
      prisma.collaboration.create({
        data: {
          userId: session.user.id,
          name: `Collab with ${influencer.name}`,
          partnerName: influencer.name,
          partnerHandle: influencer.handle,
          platform: influencer.platform ?? undefined,
          deliverables: [],
          status: "ACTIVE",
        },
        select: { id: true },
      }),
      prisma.influencerProfile.update({
        where: { id },
        data: { outreachStatus: "AGREED" },
      }),
    ]);

    return NextResponse.json({ collaborationId: collaboration.id }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
