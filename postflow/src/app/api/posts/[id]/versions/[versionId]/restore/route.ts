import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PostStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { logActivity } from "@/lib/activity-log";

const cuidSchema = z.string().cuid();

// ── POST /api/posts/[id]/versions/[versionId]/restore ─────────────────────────
// Saves the current post state as a new version, then restores the chosen version.

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, versionId } = await params;
    if (!cuidSchema.safeParse(id).success || !cuidSchema.safeParse(versionId).success) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
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
        { error: "Cannot restore a published or publishing post" },
        { status: 409 }
      );
    }

    const version = await prisma.postVersion.findUnique({
      where: { id: versionId },
      select: { postId: true, content: true, mediaType: true, mediaUrls: true },
    });
    if (!version || version.postId !== id) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }

    // Save current content as a new version before overwriting, then restore.
    const [, updatedPost] = await prisma.$transaction([
      prisma.postVersion.create({
        data: {
          postId: id,
          userId: session.user.id,
          content: post.content,
          mediaType: post.mediaType,
          mediaUrls: post.mediaUrls,
        },
      }),
      prisma.post.update({
        where: { id },
        data: {
          content: version.content,
          mediaType: version.mediaType,
          mediaUrls: version.mediaUrls,
        },
        select: { id: true, content: true, mediaType: true, mediaUrls: true, status: true, updatedAt: true },
      }),
    ]);

    logActivity({
      userId: session.user.id,
      action: "post.version_restored",
      entityId: id,
      entityType: "post",
      metadata: { versionId },
    });

    return NextResponse.json(updatedPost);
  } catch (err) {
    return handleRouteError(err);
  }
}
