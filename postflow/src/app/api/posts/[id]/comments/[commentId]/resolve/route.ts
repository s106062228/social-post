import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const postIdSchema = z.string().cuid();
const commentIdSchema = z.string().cuid();

// ── PATCH /api/posts/[id]/comments/[commentId]/resolve ─────────────────────────
// Toggle resolved state. Any post owner may resolve/unresolve comments.

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
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

    const { id, commentId } = await params;
    if (!postIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    if (!commentIdSchema.safeParse(commentId).success) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    // Verify post ownership
    const post = await prisma.post.findUnique({ where: { id }, select: { userId: true } });
    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const existing = await prisma.postComment.findUnique({
      where: { id: commentId },
      select: { id: true, postId: true, resolved: true },
    });
    if (!existing || existing.postId !== id) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    const updated = await prisma.postComment.update({
      where: { id: commentId },
      data: { resolved: !existing.resolved },
      select: {
        id: true,
        userId: true,
        authorName: true,
        comment: true,
        resolved: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ comment: updated });
  } catch (err) {
    return handleRouteError(err);
  }
}
