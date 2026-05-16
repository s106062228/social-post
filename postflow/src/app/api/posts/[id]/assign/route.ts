import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-log";
import { createNotification } from "@/lib/notifications";

const postIdSchema = z.string().cuid();

const assignSchema = z.object({
  assigneeId: z.string().cuid().nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const { id } = await params;
    if (!postIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const body: unknown = await request.json();
    const parsed = assignSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { assigneeId } = parsed.data;

    const post = await prisma.post.findUnique({
      where: { id },
      select: { id: true, userId: true, content: true, assigneeId: true },
    });

    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    if (assigneeId !== null) {
      const assignee = await prisma.user.findUnique({
        where: { id: assigneeId },
        select: { id: true },
      });
      if (!assignee) {
        return NextResponse.json({ error: "Assignee not found" }, { status: 404 });
      }
    }

    const updated = await prisma.post.update({
      where: { id },
      data: { assigneeId },
      select: { assigneeId: true },
    });

    const action = assigneeId ? "post.assigned" : "post.unassigned";
    void logActivity({
      userId: session.user.id,
      action,
      entityId: id,
      entityType: "post",
      metadata: { assigneeId },
    });

    if (assigneeId && assigneeId !== session.user.id) {
      const preview = post.content.slice(0, 80);
      void createNotification({
        userId: assigneeId,
        type: "post_assigned",
        title: "Post assigned to you",
        body: `You have been assigned a post: "${preview}${post.content.length > 80 ? "…" : ""}"`,
        entityId: id,
        entityType: "post",
      });
    }

    return NextResponse.json({ assigneeId: updated.assigneeId });
  } catch (err) {
    return handleRouteError(err);
  }
}
