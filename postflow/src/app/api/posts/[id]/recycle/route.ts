import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PostStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-log";

const postIdSchema = z.string().cuid();

const recycleBodySchema = z.object({
  scheduledAt: z.string().datetime().optional(),
});

export async function POST(
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

    const original = await prisma.post.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        content: true,
        mediaType: true,
        mediaUrls: true,
        status: true,
      },
    });

    if (!original || original.userId !== session.user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    if (original.status !== PostStatus.PUBLISHED) {
      return NextResponse.json(
        { error: "Only published posts can be recycled" },
        { status: 409 }
      );
    }

    let body: { scheduledAt?: string } = {};
    try {
      const raw = await request.json() as unknown;
      const parsed = recycleBodySchema.safeParse(raw);
      if (parsed.success) body = parsed.data;
    } catch {
      // no body is fine
    }

    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
    const status = scheduledAt ? PostStatus.SCHEDULED : PostStatus.DRAFT;

    const recycled = await prisma.post.create({
      data: {
        userId: session.user.id,
        content: original.content,
        mediaType: original.mediaType,
        mediaUrls: original.mediaUrls,
        status,
        scheduledAt,
      },
      include: { publishResults: true },
    });

    logActivity({
      userId: session.user.id,
      action: "post.recycled",
      entityId: recycled.id,
      entityType: "post",
      metadata: { sourcePostId: id },
    });

    return NextResponse.json(recycled, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
