import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

// ── DELETE /api/campaigns/[id]/posts/[postId] ─────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; postId: string }> }
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

    const { id: campaignId, postId } = await params;

    if (!campaignId || campaignId.length < 10) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const entry = await prisma.campaignPost.findUnique({
      where: { campaignId_postId: { campaignId, postId } },
    });
    if (!entry) {
      return NextResponse.json({ error: "Post not in campaign" }, { status: 404 });
    }

    await prisma.campaignPost.delete({
      where: { campaignId_postId: { campaignId, postId } },
    });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleRouteError(err);
  }
}
