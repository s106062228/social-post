import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const postIdSchema = z.string().cuid();
const commentIdSchema = z.string().cuid();

// ── DELETE /api/posts/[id]/comments/[commentId] ────────────────────────────────

export async function DELETE(
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

    // Only the comment author can delete their own comment
    const existing = await prisma.postComment.findUnique({
      where: { id: commentId },
      select: { id: true, userId: true, postId: true },
    });
    if (!existing || existing.postId !== id) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }
    if (existing.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.postComment.delete({ where: { id: commentId } });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── PATCH /api/posts/[id]/comments/[commentId]/resolve is handled separately ──
// This file handles DELETE only; resolve lives in /resolve/route.ts
