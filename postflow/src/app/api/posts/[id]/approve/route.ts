import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApprovalStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { logActivity } from "@/lib/activity-log";
import { createNotification, NOTIFICATION_TYPES } from "@/lib/notifications";

const postIdSchema = z.string().cuid();

// ── POST /api/posts/[id]/approve ──────────────────────────────────────────────

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

    const post = await prisma.post.findUnique({ where: { id } });

    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    if (post.approvalStatus !== ApprovalStatus.PENDING) {
      return NextResponse.json(
        { error: "Only posts pending approval can be approved" },
        { status: 409 }
      );
    }

    const updated = await prisma.post.update({
      where: { id },
      data: { approvalStatus: ApprovalStatus.APPROVED, approverNote: null },
    });

    logActivity({
      userId: session.user.id,
      action: "post.approved",
      entityId: id,
      entityType: "post",
    });

    createNotification({
      userId: session.user.id,
      type: NOTIFICATION_TYPES.POST_APPROVED,
      title: "Post approved",
      body: "Your post has been approved and is ready to schedule.",
      entityId: id,
      entityType: "post",
    });

    return NextResponse.json({ post: updated });
  } catch (err) {
    return handleRouteError(err);
  }
}
