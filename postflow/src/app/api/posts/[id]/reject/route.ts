import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApprovalStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { logActivity } from "@/lib/activity-log";
import { createNotification, NOTIFICATION_TYPES } from "@/lib/notifications";

const postIdSchema = z.string().cuid();

const rejectBodySchema = z.object({
  note: z.string().max(500).optional(),
});

// ── POST /api/posts/[id]/reject ───────────────────────────────────────────────

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

    const body: unknown = await request.json().catch(() => ({}));
    const parsed = rejectBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const post = await prisma.post.findUnique({ where: { id } });

    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    if (post.approvalStatus !== ApprovalStatus.PENDING) {
      return NextResponse.json(
        { error: "Only posts pending approval can be rejected" },
        { status: 409 }
      );
    }

    const updated = await prisma.post.update({
      where: { id },
      data: {
        approvalStatus: ApprovalStatus.REJECTED,
        approverNote: parsed.data.note ?? null,
      },
    });

    logActivity({
      userId: session.user.id,
      action: "post.rejected",
      entityId: id,
      entityType: "post",
      metadata: { note: parsed.data.note },
    });

    createNotification({
      userId: session.user.id,
      type: NOTIFICATION_TYPES.POST_REJECTED,
      title: "Post rejected",
      body: parsed.data.note
        ? `Your post was rejected: ${parsed.data.note}`
        : "Your post was rejected. Please review and resubmit.",
      entityId: id,
      entityType: "post",
    });

    return NextResponse.json({ post: updated });
  } catch (err) {
    return handleRouteError(err);
  }
}
