import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { MediaType, PostStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";

const postIdSchema = z.string().cuid();

// ── GET /api/posts/[id]/versions ───────────────────────────────────────────────

export async function GET(
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

    const post = await prisma.post.findUnique({ where: { id }, select: { userId: true } });
    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const versions = await prisma.postVersion.findMany({
      where: { postId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        content: true,
        mediaType: true,
        mediaUrls: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ versions });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── POST /api/posts/[id]/versions ──────────────────────────────────────────────
// Manually snapshot the current post content as a version.

export async function POST(
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

    const post = await prisma.post.findUnique({
      where: { id },
      select: { userId: true, content: true, mediaType: true, mediaUrls: true, status: true },
    });
    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    if (
      post.status === PostStatus.PUBLISHING ||
      post.status === PostStatus.PUBLISHED ||
      post.status === PostStatus.PARTIALLY_PUBLISHED
    ) {
      return NextResponse.json(
        { error: "Cannot snapshot a published or publishing post" },
        { status: 409 }
      );
    }

    const version = await prisma.postVersion.create({
      data: {
        postId: id,
        userId: session.user.id,
        content: post.content,
        mediaType: post.mediaType as MediaType,
        mediaUrls: post.mediaUrls,
      },
      select: { id: true, content: true, mediaType: true, mediaUrls: true, createdAt: true },
    });

    return NextResponse.json(version, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
