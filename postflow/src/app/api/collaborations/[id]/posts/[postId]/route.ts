import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

type RouteContext = { params: Promise<{ id: string; postId: string }> };

// ── DELETE /api/collaborations/[id]/posts/[postId] ────────────────────────────

export async function DELETE(
  _request: NextRequest,
  context: RouteContext
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

    const { id, postId } = await context.params;

    const collaboration = await prisma.collaboration.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!collaboration) {
      return NextResponse.json({ error: "Collaboration not found" }, { status: 404 });
    }

    const link = await prisma.collaborationPost.findUnique({
      where: { collaborationId_postId: { collaborationId: id, postId } },
    });
    if (!link) {
      return NextResponse.json({ error: "Post not linked to this collaboration" }, { status: 404 });
    }

    await prisma.collaborationPost.delete({
      where: { collaborationId_postId: { collaborationId: id, postId } },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
