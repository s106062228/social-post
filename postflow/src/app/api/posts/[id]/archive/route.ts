import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-log";

const postIdSchema = z.string().cuid();

export async function PATCH(
  _request: NextRequest,
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

    const post = await prisma.post.findUnique({
      where: { id },
      select: { id: true, userId: true, archivedAt: true },
    });

    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const isArchiving = !post.archivedAt;
    const updated = await prisma.post.update({
      where: { id },
      data: { archivedAt: isArchiving ? new Date() : null },
      select: { archivedAt: true },
    });

    await logActivity({
      userId: session.user.id,
      action: isArchiving ? "post.archived" : "post.unarchived",
      entityId: id,
      entityType: "post",
    });

    return NextResponse.json({ archivedAt: updated.archivedAt });
  } catch (err) {
    return handleRouteError(err);
  }
}
