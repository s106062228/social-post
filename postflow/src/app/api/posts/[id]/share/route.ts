import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";

const postIdSchema = z.string().cuid();

const createShareSchema = z.object({
  expiresAt: z.string().datetime().optional(),
});

// ── POST /api/posts/[id]/share ────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!postIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const post = await prisma.post.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    let body: { expiresAt?: string } = {};
    try {
      const raw: unknown = await request.json();
      const parsed = createShareSchema.safeParse(raw);
      if (parsed.success) body = parsed.data;
    } catch {
      // empty body is fine
    }

    const existing = await prisma.shareLink.findUnique({
      where: { postId_userId: { postId: id, userId: session.user.id } },
    });

    if (existing) {
      return NextResponse.json({ shareLink: existing });
    }

    const shareLink = await prisma.shareLink.create({
      data: {
        postId: id,
        userId: session.user.id,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
    });

    return NextResponse.json({ shareLink }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── DELETE /api/posts/[id]/share ──────────────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!postIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const deleted = await prisma.shareLink.deleteMany({
      where: { postId: id, userId: session.user.id },
    });

    if (deleted.count === 0) {
      return NextResponse.json({ error: "Share link not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
