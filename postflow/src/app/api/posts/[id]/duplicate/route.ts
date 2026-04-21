import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PostStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { logActivity } from "@/lib/activity-log";

const postIdSchema = z.string().cuid();

// ── POST /api/posts/[id]/duplicate ────────────────────────────────────────────

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

    const original = await prisma.post.findUnique({ where: { id } });
    if (!original || original.userId !== session.user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const duplicate = await prisma.post.create({
      data: {
        userId: session.user.id,
        content: original.content,
        mediaType: original.mediaType,
        mediaUrls: original.mediaUrls,
        status: PostStatus.DRAFT,
        scheduledAt: null,
      },
      include: { publishResults: true },
    });

    logActivity({
      userId: session.user.id,
      action: "post.duplicated",
      entityId: duplicate.id,
      entityType: "post",
      metadata: { sourcePostId: id },
    });

    return NextResponse.json(duplicate, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
